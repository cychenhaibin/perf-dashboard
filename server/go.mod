module perf-dashboard

// server/ 只用 Go 标准库 (net/http, embed, context, log, time, 等) —
// 不需要任何第三方依赖, 所以这个 go.mod 极简. Vercel 看到 server/ 里
// 只有 go.mod (没有任何 .go) 不会再误判为 Go 项目; web/ + api/ 走
// Vite + Functions 流程, 互不干扰.
go 1.22
