'use client'

import { useEffect, useMemo, useRef } from 'react'
import PropTypes from 'prop-types'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { buildSimulationGraphData } from '../utils/simulationGraphData'

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, DataZoomComponent, CanvasRenderer])

const CHART_COLORS = ['#57ded0', '#ffd166', '#8fb5ff', '#ff8c82', '#c3a6ff', '#8fe0a2', '#f3a6d6']
const LEGEND_LABEL_LIMIT = 16

function shortenLabel(value, limit = LEGEND_LABEL_LIMIT) {
  const label = String(value || '')
  if (label.length <= limit) return label
  const visibleLength = limit - 1
  const prefixLength = Math.ceil(visibleLength / 2)
  const suffixLength = Math.floor(visibleLength / 2)
  return `${label.slice(0, prefixLength)}…${label.slice(-suffixLength)}`
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function createChartOption(graphData) {
  const unitGroups = new Map()
  graphData.series.forEach((series) => {
    const key = series.unit || ''
    const entries = unitGroups.get(key) || []
    entries.push(series.name)
    unitGroups.set(key, entries)
  })
  const yUnits = [...unitGroups.keys()]
  const yAxes = yUnits.length > 0 ? yUnits : ['']
  const yAxis = yAxes.map((unit, index) => ({
    type: 'value',
    scale: true,
    name: unit ? shortenLabel(unit, 10) : '',
    nameLocation: 'end',
    nameGap: unit ? 8 : 0,
    nameTextStyle: { color: '#9db5ba', fontSize: 9 },
    position: index % 2 === 0 ? 'left' : 'right',
    offset: index > 1 ? Math.floor((index - 1) / 2) * 16 : 0,
    axisLabel: { color: '#829ba1', fontSize: 8, margin: 3, hideOverlap: true },
    axisLine: { show: index > 0 || yAxes.length > 1, lineStyle: { color: '#385058' } },
    splitLine: { show: index === 0, lineStyle: { color: 'rgba(116, 147, 154, 0.16)' } },
  }))
  const yAxisByUnit = new Map(yAxes.map((unit, index) => [unit, index]))

  return {
    animation: false,
    color: CHART_COLORS,
    grid: {
      top: 28,
      right: 4,
      bottom: 28,
      left: 4,
      outerBoundsMode: 'same',
      outerBoundsContain: 'all',
    },
    legend: {
      top: 2,
      left: 'center',
      padding: [2, 0, 2, 0],
      type: 'scroll',
      formatter: (name) => shortenLabel(name),
      tooltip: { show: true },
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 8,
      textStyle: { color: '#b9cccf', fontSize: 9 },
      pageTextStyle: { color: '#b9cccf' },
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'rgba(5, 15, 19, 0.96)',
      borderColor: '#527179',
      textStyle: { color: '#e5f0f2', fontSize: 11 },
      axisPointer: {
        type: 'cross',
        crossStyle: { type: 'dashed', color: '#dcebed', width: 1 },
        lineStyle: { type: 'dashed', color: '#dcebed', width: 1 },
      },
      formatter(parameters) {
        const entries = Array.isArray(parameters) ? parameters : [parameters]
        if (!entries.length) return ''
        const xValue = entries[0]?.axisValue ?? entries[0]?.data?.[0]
        const rows = [`<div style="margin-bottom:5px;color:#8ee8dc">${escapeHtml(graphData.xAxisName)}: ${escapeHtml(Number(xValue).toLocaleString(undefined, { maximumFractionDigits: 5 }))}</div>`]
        entries.forEach((entry) => {
          const series = graphData.series[entry.seriesIndex]
          const yValue = Array.isArray(entry.data) ? entry.data[1] : entry.value?.[1]
          rows.push(`<div>${entry.marker || ''}<span>${escapeHtml(entry.seriesName)}</span>: <b>${escapeHtml(Number(yValue).toLocaleString(undefined, { maximumFractionDigits: 5 }))}</b>${series?.unit ? ` ${escapeHtml(series.unit)}` : ''}</div>`)
        })
        return rows.join('')
      },
    },
    xAxis: {
      type: 'value',
      name: shortenLabel(graphData.xAxisName, 24),
      nameLocation: 'middle',
      nameGap: 32,
      nameTextStyle: { color: '#9db5ba', fontSize: 10 },
      scale: true,
      axisLabel: { color: '#829ba1', fontSize: 9, hideOverlap: true },
      axisLine: { lineStyle: { color: '#385058' } },
      splitLine: { show: false },
    },
    yAxis,
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
      {
        type: 'slider',
        xAxisIndex: 0,
        height: 14,
        bottom: 4,
        borderColor: '#344d54',
        backgroundColor: '#132329',
        fillerColor: 'rgba(87, 222, 208, 0.16)',
        handleStyle: { color: '#57ded0' },
        textStyle: { color: '#829ba1', fontSize: 8 },
        brushSelect: true,
        moveHandleSize: 0,
      },
    ],
    series: graphData.series.map((series, index) => ({
      name: series.name,
      type: 'line',
      data: series.data,
      yAxisIndex: yAxisByUnit.get(series.unit || '') ?? 0,
      showSymbol: false,
      connectNulls: false,
      sampling: 'lttb',
      lineStyle: { width: 2 },
      emphasis: { focus: 'series', lineStyle: { width: 3 } },
      itemStyle: { color: CHART_COLORS[index % CHART_COLORS.length] },
    })),
  }
}

export default function SimulationLineChart({ graph, results, modelVariables, inputValues, timeUnit }) {
  const chartElementRef = useRef(null)
  const chartRef = useRef(null)
  const graphData = useMemo(
    () => buildSimulationGraphData(graph, results, modelVariables, inputValues, timeUnit),
    [graph, inputValues, modelVariables, results, timeUnit],
  )
  const option = useMemo(() => createChartOption(graphData), [graphData])

  useEffect(() => {
    const element = chartElementRef.current
    if (!element) return undefined
    const chart = echarts.init(element, null, { renderer: 'canvas' })
    chartRef.current = chart
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => chart.resize())
    resizeObserver?.observe(element)
    const resize = () => chart.resize()
    if (!resizeObserver) window.addEventListener('resize', resize)
    return () => {
      resizeObserver?.disconnect()
      if (!resizeObserver) window.removeEventListener('resize', resize)
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!chartRef.current) return
    // Render replacements synchronously so hover events cannot hit stale series shapes.
    chartRef.current.setOption(option, { replaceMerge: ['series', 'yAxis'], lazyUpdate: false })
  }, [option])

  return (
    <div className="relative h-full min-h-32 w-full">
      <div ref={chartElementRef} role="img" aria-label={`${graph.name}: ${graphData.series.map((series) => series.name).join(', ')}`} className="h-full min-h-32 w-full" />
      {graphData.series.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-lg border border-dashed border-[#344d54] bg-[#0b141a]/90 px-3 text-center text-xs text-[#829ba1]">
          Choose at least one Y variable and run a simulation to populate this graph.
        </div>
      ) : null}
    </div>
  )
}

SimulationLineChart.propTypes = {
  graph: PropTypes.object.isRequired,
  results: PropTypes.object,
  modelVariables: PropTypes.arrayOf(PropTypes.object),
  inputValues: PropTypes.object,
  timeUnit: PropTypes.string,
}

SimulationLineChart.defaultProps = {
  timeUnit: 's',
}
