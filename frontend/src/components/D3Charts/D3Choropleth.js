// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

// src/components/D3Choropleth.js
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { feature } from 'topojson-client';

const mapTranslateX = 10;

/**
 * Format the data values for display
 * in axis labels or tooltips
 */
const valFormat = (val) =>
  Math.abs(val) < 0.001
    ? d3.format('.2e')(val)
    : d3.format(',.2~f')(val);

/**
 * Render a vertical color legend for the choropleth map
 */
function renderVerticalLegend(svg, color, position = { x: 30, y: 50 }, trueMax) {
  const legendHeight = 200;
  const legendWidth = 12;
  const legend = svg.append('g')
    .attr('transform', `translate(${position.x}, ${position.y})`);

  const isQuantile = typeof color.quantiles === 'function';
  const isQuantize = typeof color.thresholds === 'function' && !isQuantile;
  const isThreshold = !isQuantile && !isQuantize;
  const colors = color.range();

  let binEdges;

  if (isQuantile) {
    const quantiles = color.quantiles();
    binEdges = [d3.min(color.domain()), ...quantiles, d3.max(color.domain())];
  } else if (isQuantize) {
    const thresholds = color.thresholds();
    binEdges = [color.domain()[0], ...thresholds, color.domain()[1]];
  } else if (isThreshold) {
    const thresholds = color.domain(); // thresholds are manually provided
    const min = thresholds[0] - (thresholds[1] - thresholds[0]); // estimate lower bound
    const max = thresholds[thresholds.length - 1]; // use top threshold
    binEdges = [min, ...thresholds, max * 1.05];
  }

  // === QUANTILE / THRESHOLD: use band scale
  if (isQuantile || isThreshold) {
    const numBins = colors.length;
    // console.log(numBins);
    // console.log(binEdges);
    const alignedEdges = binEdges.slice(0, numBins); // align with color bins

    const legendScale = d3.scaleBand()
      .domain(d3.range(colors.length))
      .range([legendHeight, 0])
      .padding(0);

    // Color blocks
    legend.selectAll('rect')
      .data(colors)
      .join('rect')
      .attr('x', 0)
      .attr('y', (_, i) => legendScale(i))
      .attr('height', legendScale.bandwidth())
      .attr('width', legendWidth)
      .attr('fill', d => d);

    // Tick lines
    legend.selectAll('line')
      .data(alignedEdges)
      .join('line')
      .attr('x1', legendWidth)
      .attr('x2', legendWidth + 6)
      .attr('y1', (_, i) => legendScale(i) + legendScale.bandwidth())
      .attr('y2', (_, i) => legendScale(i) + legendScale.bandwidth())
      .attr('stroke', 'black')
      .attr('stroke-width', 1);

    // Vertical right border
    legend.append('line')
      .attr('x1', legendWidth)
      .attr('x2', legendWidth)
      .attr('y1', 0)
      .attr('y2', legendHeight)
      .attr('stroke', 'black')
      .attr('stroke-width', 1);

    // Tick labels
    legend.selectAll('text')
      .data(alignedEdges)
      .join('text')
      .attr('x', legendWidth + 9)
      .attr('y', (_, i) => legendScale(i) + legendScale.bandwidth())
      .attr('dy', '0.35em')
      .style('font-size', '10px')
      .text((d, i) => d3.format('.2s')(d));
    
    if (isThreshold && trueMax != null) {
      // Draw extra tick line just above top band
      legend.append('line')
        .attr('x1', legendWidth)
        .attr('x2', legendWidth + 6)
        .attr('y1', 0)
        .attr('y2', 0)
        .attr('stroke', 'black')
        .attr('stroke-width', 1);

      // Draw max value label
      legend.append('text')
        .attr('x', legendWidth + 9)
        .attr('y', 0)
        .attr('dy', '+0.35em') // lift slightly above the top tick
        .style('font-size', '10px')
        .text(d3.format('.2s')(trueMax));
    }
  } else {
    // === QUANTIZE: use linear scale
    const legendScale = d3.scaleLinear()
      .domain([binEdges[0], binEdges[binEdges.length - 1]])
      .range([legendHeight, 0]);

    legend.selectAll('rect')
      .data(colors)
      .join('rect')
      .attr('x', 0)
      .attr('y', (d, i) => legendScale(binEdges[i + 1]))
      .attr('height', (d, i) => legendScale(binEdges[i]) - legendScale(binEdges[i + 1]))
      .attr('width', legendWidth)
      .attr('fill', d => d);

    const axis = d3.axisRight(legendScale)
      .tickValues(binEdges)
      .tickFormat(d3.format('.2s'));

    legend.append('g')
      .attr('transform', `translate(${legendWidth}, 0)`)
      .call(axis)
      .selectAll('text')
      .style('font-size', '10px');
  }
}

/**
 * A component that renders a D3 county-level choropleth map of the U.S. 
 * for the given data and selected attribute
 */
const D3ChoroplethMap = ({ data, attribute, width = 500, height = 300 }) => {
  const svgRef = useRef();
  const [geoData, setGeoData] = useState(null);
  console.log(data);

  // Load shape file
  useEffect(() => {
    d3.json('/data/counties-10m.json').then(topo => {
      const counties = feature(topo, topo.objects.counties);
      setGeoData(counties);
    });
  }, []);

  useEffect(() => {
    if (!geoData || !data || !attribute) return;

    // Reset everything
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    d3.selectAll('.d3-tooltip').remove(); // clean up stale tooltips

    const tooltip = d3.select('body')
    .append('div')
    .attr('class', 'd3-tooltip')
    .style('display', 'none');

    const cleanedData = data.filter(d => typeof d[attribute] === 'number' && !isNaN(d[attribute]));
    const valueByFIPS = new Map(cleanedData.map(d => [d.FIPS, d[attribute]]));
    const nameByFIPS = new Map(data.map(d => {
      var name = d.County + ", " + d.State_Abbrev;
      return [d.FIPS, name]
    }));

    // Figure out binning, accounting for outliers
    const values = cleanedData.map(d => d[attribute]).sort(d3.ascending);
    const q1 = d3.quantile(values, 0.25);
    // const median = d3.quantile(values, 0.5);
    const q3 = d3.quantile(values, 0.75);
    const iqr = q3 - q1;
    const max = d3.max(values);
    const outlierThreshold = q3 + 1.5 * iqr;

    const numOutliers = values.filter(v => v > outlierThreshold).length;
    const pctOutliers = numOutliers / values.length;

    let color;
    const colorRange = d3.schemeBlues[7];

    if (pctOutliers > 0.05 || max > q3 * 3) {
      // If too many high-end outliers, use quantile binning
      const numBins = colorRange.length;
      const upperClip = d3.quantile(values, 0.98);
      const lowerValues = values.filter(v => v <= upperClip);

      // Create n–1 quantile thresholds from bottom 98%
      const thresholds = d3.range(1, numBins).map(i =>
        d3.quantile(lowerValues, i / (numBins - 1))
      );

      // Append upperClip to make the final bin explicit
      thresholds.push(upperClip);

      // Now use a threshold scale
      color = d3.scaleThreshold()
        .domain(thresholds)
        .range(colorRange);
    } else {
      color = d3.scaleQuantize()
        .domain(d3.extent(values))
        .range(colorRange);
    }

    const upperClip = d3.quantile(values, 0.98); // clip values above this

    const projection = d3.geoAlbersUsa().fitSize([width-mapTranslateX, height], geoData);
    const path = d3.geoPath().projection(projection);

    const mapGroup = svg.append('g')
      .attr('transform', `translate(${mapTranslateX}, 0)`); // Shift map to the right

    // Render counties
    mapGroup.selectAll('path')
      .data(geoData.features)
      .join('path')
      .attr('d', path)
      .attr('fill', d => {
        let val = valueByFIPS.get(d.id);
        if (val == null || isNaN(val)) return '#ccc';
        // Clamp only for quantile scale (skewed case)
        if (typeof color.quantiles === 'function' && val > upperClip) {
          val = upperClip;
        }
        return color(val);
      })
      .attr('stroke', '#3f3f3fff')  /*  ffffff   A9A9A9  */
      .attr('stroke-width', 0.3);

    // Tooltips
    mapGroup.selectAll('path').on('mouseover', function(event, d) {
      const value = valueByFIPS.get(d.id);
      const name = nameByFIPS.get(d.id)
      tooltip
        .style('display', 'block')
        .html(`<b>${name}</b><br/>${attribute}: ${(value != null && !isNaN(value)) ? valFormat(value) : "(missing)"}`);
      d3.select(this)
        .attr('stroke', 'black')
        .attr('stroke-width', 1.3);
    })
    .on('mousemove', function(event) {
      tooltip
        .style('top', `${event.pageY - 40}px`)
        .style('left', `${event.pageX + 10}px`);
    })
    .on('mouseout', function() {
      tooltip.style('display', 'none');
      d3.select(this)
        .attr('stroke', '#3f3f3fff')
        .attr('stroke-width', 0.3);
    });

    renderVerticalLegend(svg, color, {x: 0, y: 20}, d3.max(values));

    // Clean up
    return () => {
      tooltip.remove();
    };

  }, [geoData, data, attribute, width, height]);

  return <svg ref={svgRef} width={width} height={height} />;
};

export default D3ChoroplethMap;
