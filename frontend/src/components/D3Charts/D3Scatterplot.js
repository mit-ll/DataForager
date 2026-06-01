// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

// src/components/D3Scatterplot.js
import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

/**
 * Format the data values for display
 * in axis labels or tooltips
 */
const valFormat = (val) =>
  Math.abs(val) < 0.001
    ? d3.format('.2e')(val)
    : d3.format(',.2~f')(val);

/**
 * A component that renders a D3 scatterplot
 * for the given data and selected attributes
 */
const D3Scatterplot = ({
  data,
  xAttribute,
  yAttribute,
  colorAttribute = null,
  radiusAttribute = null,
  width = 500,
  height = 300,
  datasetMode
}) => {
  const ref = useRef();

  useEffect(() => {
    if (!data || data.length === 0 || !xAttribute || !yAttribute) return;

    // Reset everything
    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();
    d3.selectAll('.d3-tooltip').remove(); // clean up stale tooltips

    const tooltip = d3.select('body')
    .append('div')
    .attr('class', 'd3-tooltip')
    .style('display', 'none');

    const margin = { top: 20, right: 40, bottom: 50, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Filter valid entries
    const validData = data.filter(d =>
      typeof d[xAttribute] === 'number' && typeof d[yAttribute] === 'number'
    );

    // Scales
    const x = d3.scaleLinear()
      .domain(d3.extent(validData, d => d[xAttribute])).nice()
      .range([0, innerWidth]);

    const y = d3.scaleLinear()
      .domain(d3.extent(validData, d => d[yAttribute])).nice()
      .range([innerHeight, 0]);

    const color = colorAttribute
      ? d3.scaleSequential(d3.interpolateViridis)
          .domain(d3.extent(validData, d => d[colorAttribute]))
      : () => 'steelblue';

    const radius = radiusAttribute
      ? d3.scaleSqrt()
          .domain(d3.extent(validData, d => d[radiusAttribute]))
          .range([2, 8])
      : () => 4;

    const chart = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // X-axis
    chart.append('g')
      .attr('transform', `translate(0, ${innerHeight})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format('.2s')));

    // Y-axis
    chart.append('g')
      .call(d3.axisLeft(y).ticks(6).tickFormat(d3.format('.2s')));

    // Points
    chart.selectAll('circle')
      .data(validData)
      .join('circle')
      .attr('cx', d => x(d[xAttribute]))
      .attr('cy', d => y(d[yAttribute]))
      .attr('r', d => radius(d[radiusAttribute]))
      .attr('fill', d => color(d[colorAttribute]))
      .attr('stroke', 'black')
      .attr('stroke-width', '0.3px')
      .attr('opacity', 0.75);

    // Axis labels
    chart.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 40)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .text(xAttribute);

    chart.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -45)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .text(yAttribute);

    // Tooltips
    chart.selectAll('circle').on('mouseover', function(event, d) {
      const xValue = d[xAttribute];
      const yValue = d[yAttribute];
      var name;
      if (datasetMode === "counties") {
        name = d.County + ", " + d.State_Abbrev;
      } else if (datasetMode === "airports") {
        name = d.Airport + " (" + d.IATA + ")";
      } else {
        name = "Unknown";
      }
      tooltip
        .style('display', 'block')
        .html(`<b>${name}</b><br/>${xAttribute}: ${valFormat(xValue)}<br/>${yAttribute}: ${valFormat(yValue)}`);
      d3.select(this)
        // .raise()  // bring hovered point to front
        .attr('stroke', 'black')
        .attr('stroke-width', '1.3px')
        .attr('opacity', 0.95);
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
        .attr('stroke-width', '0.3px')
        .attr('opacity', 0.75);
    });
    
    // Clean up
    return () => {
      tooltip.remove();
    };

  }, [data, xAttribute, yAttribute, colorAttribute, radiusAttribute, width, height, datasetMode]);

  return <svg ref={ref} width={width} height={height} />;
};

export default D3Scatterplot;
