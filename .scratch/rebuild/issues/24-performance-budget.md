# What's the performance budget for the popup and the in-page script?

Type: grilling
Status: open
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)

## Question

Set the budgets that decide between React and Svelte, and between one UI stack and two ([ticket 05](05-ui-stacks.md)):
- **Popup:** how fast it must open. It's about 60 ms today in a production build, and Base UI's first render measured 87 ms in the benchmark.
- **Content script:** how much JS and CSS it may add to every YouTube and YouTube Music page. Today it adds 88 KB gzip of JS and 10 KB of CSS.
- **Fit:** which of ticket 05's shortlisted stacks fit those budgets.
