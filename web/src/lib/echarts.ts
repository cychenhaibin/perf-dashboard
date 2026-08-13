// ECharts module registration. Importing this file for side effects
// installs every chart / component / renderer we use across the dashboard
// (line, bar, pie, gauge). Repeating the import in multiple components is
// safe — echarts.use() dedupes internally.

import * as echarts from "echarts/core"
import {
  BarChart,
  GaugeChart,
  LineChart,
  PieChart,
} from "echarts/charts"
import {
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  TransformComponent,
} from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"
import { LabelLayout, UniversalTransition } from "echarts/features"

echarts.use([
  LineChart,
  BarChart,
  PieChart,
  GaugeChart,
  GridComponent,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  TransformComponent,
  LabelLayout,
  UniversalTransition,
  CanvasRenderer,
])

export { echarts }
