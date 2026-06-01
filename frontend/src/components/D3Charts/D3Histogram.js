// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

// src/components/D3Histogram.js
import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

const formatRange = d3.format('.2~s'); // e.g. 1K, 2.5M, etc.
const formatCount = d3.format(',');

/**
 * Format the data values for display
 * in axis labels or tooltips
 */
const valFormat = (val) =>
  val === 0? '0' :
  Math.abs(val) < 0.001
    ? d3.format('.2e')(val)
    : d3.format(',.2~f')(val);

/**
 * A component that renders a D3 histogram 
 * for the given data and selected attribute;
 * optionally remove values outside 2 std. devs. of the mean
 */
const D3Histogram = ({ data, attribute, width = 500, height = 300, remove_outliers=false }) => {
  const ref = useRef();

  useEffect(() => {
    if (!data || data.length === 0 || !attribute) return;

    // Reset everything
    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();
    d3.selectAll('.d3-tooltip').remove(); // clean up stale tooltips

    const tooltip = d3.select('body')
    .append('div')
    .attr('class', 'd3-tooltip')
    .style('display', 'none');

    const margin = { top: 20, right: 30, bottom: 50, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const cleanedData = data.filter(d => typeof d[attribute] === 'number' && !isNaN(d[attribute]));
    var values = cleanedData.map(d => d[attribute]);

    // Filter outliers (if necessary)
    var upper_limit = d3.max(values);
    if (remove_outliers) {
      upper_limit = d3.mean(values) + 2*d3.deviation(values);
    }
    values = values.filter(v => v <= upper_limit)

    var lower_limit = 0;
    var min_diff = d3.min(values) - d3.deviation(values);
    if (0 < min_diff || 0 > d3.min(values)) {
      if (remove_outliers) {
        lower_limit = d3.mean(values) - 2*d3.deviation(values);
      } else {
        lower_limit = d3.min(values); // or min - std directly if you want a float
      }
    }
    values = values.filter(v => v >= lower_limit)

    // Scales
    const x = d3.scaleLinear()
      .domain([lower_limit * 0.95, upper_limit * 1.05])
      .range([0, innerWidth]);

    const bins = d3.bin()
      .domain(x.domain())
      .thresholds(x.ticks(20))(values);

    const y = d3.scaleLinear()
      .domain([0, d3.max(bins, d => d.length)])
      .range([innerHeight, 0]);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Bars
    g.selectAll('rect')
      .data(bins)
      .join('rect')
      .attr('x', d => x(d.x0))
      .attr('y', d => y(d.length))
      .attr('width', d => x(d.x1) - x(d.x0) - 1)
      .attr('height', d => innerHeight - y(d.length))
      .attr('fill', 'steelblue')
      .attr('stroke', 'none')
      .attr('stroke-width', 0); // default: no outline;

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickFormat(formatRange));

    g.append('g')
      .call(d3.axisLeft(y));
    
    // Axis labels
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 40)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .text(attribute + " (binned)");

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -45)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .text("Count");

    // Tooltips
    g.selectAll("rect")
    .on('mouseover', function(event, d) {
      // console.log(this);
      tooltip
        .style('display', 'block')
        .html(`<b>${formatCount(d.length)} items</b><br/>${attribute}: [${valFormat(d.x0)}; ${valFormat(d.x1)})`);
      d3.select(this)
      .raise()  // bring hovered bar to front
      .attr('stroke', 'black')
      .attr('stroke-width', 2);
    })
    .on('mousemove', function(event) {
      tooltip
        .style('top', `${event.pageY - 40}px`)
        .style('left', `${event.pageX + 10}px`);
    })
    .on('mouseout', function() {
      tooltip.style('display', 'none');
      d3.select(this)
      .attr('stroke', 'none')
      .attr('stroke-width', 0);
    });

    // Clean up
    return () => {
      tooltip.remove();
    };

  }, [data, attribute, height, width, remove_outliers]);

  return <svg ref={ref} width={width} height={height} />;
};

export default D3Histogram;
