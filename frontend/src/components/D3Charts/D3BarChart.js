// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

// src/components/D3BarChart.js
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
 * A component that renders a D3 bar chart 
 * for the given data and selected attribute; 
 * the bar chart will only show the top or bottom few items,
 * based on the `count` and `direction` params
 */
const D3BarChart = ({ data, attribute, count = 20, direction = 'bottom', width = 500, height = 300, datasetMode }) => {
  const ref = useRef();

  // Sort and slice based on direction
  if (!count || count < 1) {
    count = 1;
  } else if (count > 100) {
    count = 100;
  }

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

    // Filter valid entries
    const filtered = data.filter(d => typeof d[attribute] === 'number');

    const sorted = [...filtered].sort((a, b) =>
      direction === 'top'
        ? d3.descending(a[attribute], b[attribute])
        : d3.ascending(a[attribute], b[attribute])
    ).slice(0, count);

    // Make labels
    var d_name;
    var d_id;
    var labelByID;
    var longLabelByID;
    if (datasetMode === "counties") {
      d_name = "County";
      d_id = "FIPS";
      labelByID = Object.fromEntries(sorted.map(d => {
          var labelStr = d[d_name].length <= 22 ? d[d_name] : d[d_name].substring(0, 19) + "...";
          return [d[d_id], labelStr + ", " + d.State_Abbrev]
      }));
      longLabelByID = Object.fromEntries(sorted.map(d => [d[d_id], d[d_name] + ", " + d.State_Abbrev]));
    } else if (datasetMode === "airports") {
      d_name = "Airport";
      d_id = "IATA";
      labelByID = Object.fromEntries(sorted.map(d => {
          var labelStr = d[d_name].length <= 22 ? d[d_name] : d[d_name].substring(0, 19) + "...";
          return [d[d_id], labelStr + " (" + d[d_id] + ")"]
      }));
      longLabelByID = Object.fromEntries(sorted.map(d => [d[d_id], d[d_name] + " (" + d[d_id] + ")"]));
    } else {
      d_name = "Unknown";
      d_id = "Unknown";
    }

    // Margin and dimensions
    const margin = { top: 20, right: 40, bottom: 30, left: 150 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Scales
    const x = d3.scaleLinear()
      .domain([0, d3.max(sorted, d => d[attribute])])
      .range([0, innerWidth]);

    const y = d3.scaleBand()
      .domain(sorted.map((d, i) => d[d_id] ?? `Item ${i}`)) // customize label logic
      .range([0, innerHeight])
      .padding(0.2);

    const chart = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Bars
    chart.selectAll('rect')
      .data(sorted)
      .join('rect')
      .attr('y', d => y(d[d_id]))
      .attr('height', y.bandwidth())
      .attr('x', 0)
      .attr('width', d => x(d[attribute]))
      .attr('fill', 'steelblue');

    // Labels
    chart.selectAll('text.label')
      .data(sorted)
      .join('text')
      .attr('class', 'label')
      .attr('y', d => y(d[d_id]) + y.bandwidth() / 2 + 4)
      .attr('x', d => x(d[attribute]) + 5)
      .text(d => d3.format('.2s')(d[attribute]))
      .style('font-size', '10px');

    // Y-axis (labels)
    chart.append('g')
      .call(d3.axisLeft(y).tickFormat(id => labelByID ? (labelByID[id] || id) : "Unknown"));

    // X-axis (values)
    chart.append('g')
      .attr('transform', `translate(0, ${innerHeight})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format('.2s')))
      .selectAll('text')
      .style('font-size', '10px');

    // Tooltips
    chart.selectAll('rect').on('mouseover', function(event, d) {
      const value = d[attribute];
      var d_name = longLabelByID? longLabelByID[d[d_id]] : "Unknown";
      tooltip
        .style('display', 'block')
        .html(`<b>${d_name}</b><br/>${attribute}: ${valFormat(value)}`);
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
    
    // Clean up
    return () => {
      tooltip.remove();
    };

  }, [data, attribute, count, direction, width, height, datasetMode]);

  return <svg ref={ref} width={width} height={height} />;
};

export default D3BarChart;
