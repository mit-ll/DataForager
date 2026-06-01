// Copyright (c) 2026 Massachusetts Institute of Technology
// SPDX-License-Identifier: MIT

import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

const formatRange = d3.format('.2~s');
const formatCount = d3.format(',');

/**
 * Format the data values for display
 * in axis labels or tooltips
 */
const valFormat = (val) =>
  val === 0 ? '0' :
  Math.abs(val) < 0.001
    ? d3.format('.2e')(val)
    : d3.format(',.2f')(val);

/**
 * A component that renders a D3 boxplot 
 * for the given data and selected attribute
 */
const D3Boxplot = ({ data, attribute, width = 500, height = 300, datasetMode }) => {
  const ref = useRef();

  useEffect(() => {
    if (!data || !attribute) return;

    // Reset everything
    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();

    const tooltip = d3.select('body')
      .append('div')
      .attr('class', 'd3-tooltip')
      .style('display', 'none');

    const margin = { top: 5, right: 30, bottom: 30, left: 40 };
    const chartHeight = height * 0.55;
    // const statsHeight = height * 0.45;

    const innerWidth = width - margin.left - margin.right;
    const innerChartHeight = chartHeight - margin.top - margin.bottom;

    const values = data
      .map(d => d[attribute])
      .filter(v => typeof v === 'number' && !isNaN(v))
      .sort(d3.ascending);

    if (values.length === 0) return;

    // Compute key stats
    const mean = d3.mean(values);
    const median = d3.quantile(values, 0.5);
    const q1 = d3.quantile(values, 0.25);
    const q3 = d3.quantile(values, 0.75);
    const iqr = q3 - q1;
    const min = d3.min(values.filter(v => v >= q1 - 1.5 * iqr));
    const max = d3.max(values.filter(v => v <= q3 + 1.5 * iqr));
    const stdDev = d3.deviation(values);
    const numTotal = data.length;
    const numValid = values.length;
    const numNull = numTotal - numValid;
    const pctNull = numNull / numTotal;

    // Scale
    const x = d3.scaleLinear()
      .domain([min, max])
      .range([0, innerWidth])
      .nice();

    const chart = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Append graphical elements
    chart.append('line')
      .attr('x1', x(min))
      .attr('x2', x(max))
      .attr('y1', innerChartHeight / 2)
      .attr('y2', innerChartHeight / 2)
      .attr('stroke', '#333');

    const nQ1ToMed = values.filter(v => v >= q1 && v <= median).length;
    const nMedToQ3 = values.filter(v => v >= median && v <= q3).length;
    const nMinToQ1 = values.filter(v => v >= min && v < q1).length;
    const nQ3ToMax = values.filter(v => v > q3 && v <= max).length;

    // Q1 to median box
    chart.append('rect')
      .attr('x', x(q1))
      .attr('y', innerChartHeight / 2 - 20)
      .attr('width', x(median) - x(q1))
      .attr('height', 40)
      .attr('fill', 'steelblue')
      .attr('stroke', '#333')
      .on('mouseover', function () {
        tooltip.style('display', 'block').html(
          `<b>Q1–Median: ${formatCount(nQ1ToMed)} items</b><br/>${attribute}: [${valFormat(q1)}; ${valFormat(median)}]`
        );
        d3.select(this).attr('stroke', 'black').attr('stroke-width', 2);
      })
      .on('mousemove', event => {
        tooltip.style('top', `${event.pageY - 40}px`).style('left', `${event.pageX + 10}px`);
      })
      .on('mouseout', function () {
        tooltip.style('display', 'none');
        d3.select(this).attr('stroke', '#333').attr('stroke-width', 1);
      });

    // Median to Q3 box
    chart.append('rect')
      .attr('x', x(median))
      .attr('y', innerChartHeight / 2 - 20)
      .attr('width', x(q3) - x(median))
      .attr('height', 40)
      .attr('fill', 'steelblue')
      .attr('stroke', '#333')
      .on('mouseover', function () {
        tooltip.style('display', 'block').html(
          `<b>Median–Q3: ${formatCount(nMedToQ3)} items</b><br/>${attribute}: [${valFormat(median)}; ${valFormat(q3)}]`
        );
        d3.select(this).attr('stroke', 'black').attr('stroke-width', 2);
      })
      .on('mousemove', event => {
        tooltip.style('top', `${event.pageY - 40}px`).style('left', `${event.pageX + 10}px`);
      })
      .on('mouseout', function () {
        tooltip.style('display', 'none');
        d3.select(this).attr('stroke', '#333').attr('stroke-width', 1);
      });

    // Median line
    chart.append('line')
      .attr('x1', x(median))
      .attr('x2', x(median))
      .attr('y1', innerChartHeight / 2 - 20)
      .attr('y2', innerChartHeight / 2 + 20)
      .attr('stroke', '#000')
      .attr('stroke-width', 1.5)
      .on('mouseover', function () {
        tooltip.style('display', 'block').html(`<b>Median</b><br/>${attribute}: ${valFormat(median)}`);
        d3.select(this).attr('stroke-width', 3);
      })
      .on('mousemove', event => {
        tooltip.style('top', `${event.pageY - 40}px`).style('left', `${event.pageX + 10}px`);
      })
      .on('mouseout', function () {
        tooltip.style('display', 'none');
        d3.select(this).attr('stroke-width', 1.5);
      });

    // Min to Q1 line
    chart.append('line')
      .attr('x1', x(min))
      .attr('x2', x(q1))
      .attr('y1', innerChartHeight / 2)
      .attr('y2', innerChartHeight / 2)
      .attr('stroke', '#333')
      .attr('stroke-width', 1.5)
      .on('mouseover', function () {
        tooltip.style('display', 'block').html(
          `<b>Min–Q1: ${formatCount(nMinToQ1)} items</b><br/>${attribute}: [${valFormat(min)}; ${valFormat(q1)})`
        );
        d3.select(this).attr('stroke', 'black').attr('stroke-width', 3);
      })
      .on('mousemove', event => {
        tooltip.style('top', `${event.pageY - 40}px`).style('left', `${event.pageX + 10}px`);
      })
      .on('mouseout', function () {
        tooltip.style('display', 'none');
        d3.select(this).attr('stroke', '#333').attr('stroke-width', 1.5);
      });

    // Q3 to max line
    chart.append('line')
      .attr('x1', x(q3))
      .attr('x2', x(max))
      .attr('y1', innerChartHeight / 2)
      .attr('y2', innerChartHeight / 2)
      .attr('stroke', '#333')
      .attr('stroke-width', 1.5)
      .on('mouseover', function () {
        tooltip.style('display', 'block').html(
          `<b>Q3–Max: ${formatCount(nQ3ToMax)} items</b><br/>${attribute}: (${valFormat(q3)}; ${valFormat(max)}]`
        );
        d3.select(this).attr('stroke', 'black').attr('stroke-width', 3);
      })
      .on('mousemove', event => {
        tooltip.style('top', `${event.pageY - 40}px`).style('left', `${event.pageX + 10}px`);
      })
      .on('mouseout', function () {
        tooltip.style('display', 'none');
        d3.select(this).attr('stroke', '#333').attr('stroke-width', 1.5);
      });

    // Outlier points
    const outliers = data.filter(d => {
      const v = d[attribute];
      return typeof v === 'number' && !isNaN(v) && (v < min || v > max);
    });

    outliers.forEach(d => {
      const val = d[attribute];
      var name;
      if (datasetMode === "counties") {
        name = d.County ? `${d.County}, ${d.State_Abbrev}` : 'Unknown';
      } else if (datasetMode === "airports") {
        name = d.Airport ? `${d.Airport} (${d.IATA})` : 'Unknown';
      } else{
        name = "Unknown";
      }

      chart.append('circle')
        .attr('cx', x(val))
        .attr('cy', innerChartHeight / 2)
        .attr('r', 4)
        .attr('fill', 'steelblue')
        .attr('stroke', 'black')
        .attr('stroke-width', '0.3px')
        .attr('opacity', 0.75)
        .on('mouseover', function () {
          tooltip.style('display', 'block').html(`<b>${name}</b><br/>${attribute}: ${valFormat(val)}`);
          d3.select(this).attr('stroke-width', '1.3px').attr('opacity', 0.95);
        })
        .on('mousemove', event => {
          tooltip.style('top', `${event.pageY - 40}px`).style('left', `${event.pageX + 10}px`);
        })
        .on('mouseout', function () {
          tooltip.style('display', 'none');
          d3.select(this).attr('stroke-width', '0.3px').attr('opacity', 0.75);
        });
    });

    // Axis and label
    chart.append('g')
      .attr('transform', `translate(0, ${innerChartHeight - 30})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(formatRange));

    chart.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerChartHeight + 5)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .text(attribute);

    // Descriptive stats (in lower half)
    const statsGroup = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${chartHeight + 15})`)
      .style('font-size', '12px')
      .style('font-family', 'sans-serif');

    const stats = [
      `Mean: ${valFormat(mean)}`,
      `Median: ${valFormat(median)}`,
      `Std Dev: ${valFormat(stdDev)}`,
      `Min: ${valFormat(min)}`,
      `Max: ${valFormat(max)}`,
      `Nulls: ${formatCount(numNull)} (${(pctNull * 100).toFixed(2)}%)`
    ];

    const labelWidth = 75; // space reserved for labels
    const valueWidth = 100; // space reserved for values
    const lineHeight = 18;

    const totalWidth = labelWidth + valueWidth;
    const centerX = innerWidth / 2;

    // Append text for stats
    statsGroup.selectAll('text')
    .data(stats)
    .join('text')
    .attr('y', (d, i) => i * lineHeight)
    .each(function(d) {
        const [label, value] = d.split(': ');
        d3.select(this)
        .text(null)
        .append('tspan')
        .attr('x', centerX - totalWidth / 2)
        .attr('text-anchor', 'start')
        .text(label + ':');

        d3.select(this)
        .append('tspan')
        .attr('x', centerX + totalWidth / 2)
        .attr('text-anchor', 'end')
        .text(value);
    });

    // Clean up
    return () => {
      tooltip.remove();
    };

  }, [data, attribute, width, height, datasetMode]);

  return <svg ref={ref} width={width} height={height} />;
};

export default D3Boxplot;
