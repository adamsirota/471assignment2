const names = ["Substantiated", "Exonerated", "Unsubstantiated", "Other / missing"];
const colors = ["#28766b", "#477fa8", "#c78b40", "#888888"];
const BLACK_COLORS = { majority: "#1f4e79", other: "#7f9bb6" };

// Black hat chart settings. The window and the candidate pool are fixed, so they do not follow the
// year menus. Pick the window with the console scan, then leave it fixed.
const BLACK_FROM = 1995;
const BLACK_TO = 2020;

function selectComparison(groups) {
  const eligible = groups.filter(group => group.count >= 100 && group.precinct !== "Unknown");
  const rateOrder = (first, second) => first.outcomes[0] / first.count - second.outcomes[0] / second.count;
  const majority = eligible.filter(group => (group.races.get("Black") || 0) / group.count > 0.5).sort(rateOrder).slice(0, 3);
  const comparison = eligible.filter(group => (group.races.get("Black") || 0) / group.count <= 0.5).sort((first, second) => rateOrder(second, first)).slice(0, 3);
  return { majority, comparison };
}

function summarize(rows) {
  const groups = new Map();
  for (const row of rows) {
    const precinct = row.precinct.trim() || "Unknown";
    if (!groups.has(precinct)) groups.set(precinct, { precinct, count: 0, outcomes: [0, 0, 0, 0], races: new Map() });
    const group = groups.get(precinct);
    group.count++;
    const disposition = (row.board_disposition || "").trim();
    const index = disposition.startsWith("Substantiated") ? 0 : names.indexOf(disposition);
    group.outcomes[index < 0 ? 3 : index]++;
    const race = (row.complainant_ethnicity || "").trim() || "Missing";
    group.races.set(race, (group.races.get(race) || 0) + 1);
  }
  return [...groups.values()].sort((first, second) => first.precinct.localeCompare(second.precinct, undefined, { numeric: true }));
}

// Black hat chart: drawn once, from its own fixed window, independent of the year menus.
function renderBlack(rows) {
  const subset = rows.filter(row => row.year_received.trim()
    && Number(row.year_received) >= BLACK_FROM && Number(row.year_received) <= BLACK_TO);
  const { majority, comparison } = selectComparison(summarize(subset));
  const selected = [...majority, ...comparison];
  const black = d3.select("#black-chart").attr("viewBox", "0 0 850 420");
  black.selectAll("*").remove();
  d3.select("#black-subtitle").text(
    "Share of allegations substantiated, " + BLACK_FROM + "–" + BLACK_TO +
    ". Precincts with at least 100 allegations."
  );
  if (!majority.length || !comparison.length) {
    black.append("text").attr("x", 30).attr("y", 50).text("Not enough qualifying precincts for this comparison.");
    return;
  }
  const rates = selected.map(group => group.outcomes[0] / group.count);
  const horizontal = d3.scaleLinear()
    .domain([Math.floor(d3.min(rates) * 10) / 10, Math.ceil(d3.max(rates) * 20) / 20])
    .range([100, 720]);
  const vertical = d3.scaleBand().domain(selected.map(group => group.precinct)).range([65, 350]).padding(0.3);
  black.append("rect").attr("x", 100).attr("y", 19).attr("width", 11).attr("height", 11).attr("fill", BLACK_COLORS.majority);
  black.append("text").attr("x", 117).attr("y", 30).attr("fill", "#2a3a4a").text("Black precincts");
  black.append("rect").attr("x", 320).attr("y", 19).attr("width", 11).attr("height", 11).attr("fill", BLACK_COLORS.other);
  black.append("text").attr("x", 337).attr("y", 30).attr("fill", "#2a3a4a").text("Other precincts");
  black.append("g").attr("transform", "translate(0,360)").call(d3.axisBottom(horizontal).ticks(5).tickFormat(d3.format(".0%")));
  black.append("g").attr("transform", "translate(95,0)").call(d3.axisLeft(vertical).tickSize(0));
  for (const group of selected) {
    const rate = group.outcomes[0] / group.count;
    const label = majority.includes(group) ? "Black precinct" : "Other precinct";
    black.append("rect").attr("x", 100).attr("y", vertical(group.precinct)).attr("width", horizontal(rate) - 100).attr("height", vertical.bandwidth())
      .attr("fill", majority.includes(group) ? BLACK_COLORS.majority : BLACK_COLORS.other)
      .append("title").text(label + " " + group.precinct + ": " + d3.format(".1%")(rate));
    black.append("text").attr("x", horizontal(rate) + 8).attr("y", vertical(group.precinct) + vertical.bandwidth() / 2).attr("dominant-baseline", "middle").text(d3.format(".1%")(rate));
  }
  black.append("text").attr("x", 290).attr("y", 405).text("Allegations substantiated (%)");
}

const selectionCheck = selectComparison([
  { precinct: "1", count: 100, outcomes: [20], races: new Map([["Black", 60]]) },
  { precinct: "2", count: 100, outcomes: [40], races: new Map([["Black", 30]]) },
  { precinct: "3", count: 99, outcomes: [1], races: new Map([["Black", 80]]) }
]);
if (selectionCheck.majority.length !== 1 || selectionCheck.majority[0].precinct !== "1"
    || selectionCheck.comparison.length !== 1 || selectionCheck.comparison[0].precinct !== "2"
    || selectComparison([]).majority.length !== 0) throw new Error("Comparison selection check failed");
const check = summarize([{ precinct: "1", board_disposition: "Substantiated (Charges)" }, { precinct: "1" }]);
if (check[0].count !== 2 || check[0].outcomes[0] !== 1 || check[0].outcomes[3] !== 1 || check[0].races.get("Missing") !== 2) throw new Error("Aggregation check failed");

async function initialize() {
  const status = document.querySelector("#status");
  try {
    if (!window.d3) throw new Error("D3 did not load.");
    const rows = await d3.csv("data/allegations_202007271729.csv");
    if (!rows.length || !["precinct", "year_received", "board_disposition", "complainant_ethnicity"].every(field => rows.columns.includes(field))) throw new Error("Missing data or required columns.");
    const years = rows.map(row => Number(row.year_received)).filter(year => Number.isInteger(year) && year > 0);
    const start = d3.select("#start-year");
    const end = d3.select("#end-year");
    for (const control of [start, end]) {
      control.selectAll("option").data(d3.range(d3.min(years), d3.max(years) + 1)).join("option").attr("value", year => year).text(year => year);
      control.property("disabled", false).on("change", render);
    }
    start.property("value", d3.min(years));
    end.property("value", d3.max(years));
    d3.select("#legend").selectAll("span").data(names).join("span").style("border-left", (name, index) => "14px solid " + colors[index]).style("padding", "0 8px").text(name => name);

    // White hat chart only. The black hat chart is drawn separately by renderBlack().
    function render() {
      d3.selectAll("#white-axis, #white-chart").selectAll("*").remove();
      document.querySelector("#detail").textContent = "Hover or focus a bar for counts and complainant race / ethnicity.";
      const from = Number(start.property("value"));
      const through = Number(end.property("value"));
      if (from > through) { status.textContent = "Start year must be at or before end year."; return; }
      const filtered = rows.filter(row => row.year_received.trim() && Number(row.year_received) >= from && Number(row.year_received) <= through);
      const groups = summarize(filtered).sort((first, second) => second.outcomes[0] / second.count - first.outcomes[0] / first.count);
      status.textContent = from + "–" + through + ": " + filtered.length.toLocaleString() + " allegation records.";
      if (!groups.length) { status.textContent += " No matching records."; return; }
      document.querySelector(".white-panel").scrollTop = 0;
      const white = d3.select("#white-chart").attr("viewBox", "0 0 850 " + (groups.length * 26 + 20));
      const scale = d3.scaleLinear().domain([0, 1]).range([105, 710]);
      const positions = d3.scaleBand().domain(groups.map(group => group.precinct)).range([0, groups.length * 26]).padding(0.2);
      const axisHeader = d3.select("#white-axis").attr("viewBox", "0 0 850 64");
      axisHeader.append("text")
        .attr("x", (scale.range()[0] + scale.range()[1]) / 2)
        .attr("y", 16)
        .attr("text-anchor", "middle")
        .attr("font-weight", 600)
        .text("Share of the precinct's allegations, by outcome");
      axisHeader.append("text").attr("x", 95).attr("y", 60).attr("text-anchor", "end").attr("font-weight", 600).text("Precinct");
      axisHeader.append("text").attr("x", 720).attr("y", 60).attr("font-weight", 600).text("Allegations (n)");
      axisHeader.append("g").attr("transform", "translate(0,56)").call(d3.axisTop(scale).ticks(5).tickFormat(d3.format(".0%")));
      white.append("g").attr("transform", "translate(100,0)").call(d3.axisLeft(positions).tickSize(0));
      for (const group of groups) {
        const description = "Precinct " + group.precinct + "; n=" + group.count + ". " + names.map((name, index) => name + ": " + group.outcomes[index] + " (" + d3.format(".1%")(group.outcomes[index] / group.count) + ")").join("; ") + ". Complainant race / ethnicity: " + [...group.races].map(([race, count]) => race + ": " + count + " (" + d3.format(".1%")(count / group.count) + ")").join("; ");
        const bar = white.append("g").attr("tabindex", 0).attr("role", "img").attr("aria-label", description).on("mouseenter focus", () => { document.querySelector("#detail").textContent = description; });
        bar.append("title").text(description);
        let offset = 0;
        group.outcomes.forEach((count, index) => {
          bar.append("rect").attr("x", scale(offset / group.count)).attr("y", positions(group.precinct)).attr("width", scale(count / group.count) - scale(0)).attr("height", positions.bandwidth()).attr("fill", colors[index]);
          offset += count;
        });
        white.append("text").attr("x", 720).attr("y", positions(group.precinct) + positions.bandwidth() / 2).attr("dominant-baseline", "middle").text("n=" + group.count.toLocaleString());
      }
      const totalAllegations = d3.sum(groups, group => group.count);
      const overall = d3.sum(groups, group => group.outcomes[0]) / totalAllegations;
      const baselineStyle = selection => selection
        .attr("stroke", "#222")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "5,3")
        .style("pointer-events", "none");
      white.append("line").call(baselineStyle)
        .attr("x1", scale(overall)).attr("x2", scale(overall))
        .attr("y1", 0).attr("y2", groups.length * 26);
      axisHeader.append("line").call(baselineStyle)
        .attr("x1", scale(overall)).attr("x2", scale(overall))
        .attr("y1", 56).attr("y2", 64);
      d3.select("#baseline-note").text(
        "Dashed line: share of all allegations in this dataset, in the selected years, that were substantiated (" +
        d3.format(".1%")(overall) + " of " + totalAllegations.toLocaleString() + " allegation records)."
      );
    }
    render();
    renderBlack(rows);
  } catch (error) { status.textContent = "Unable to load charts: " + error.message + " Use Live Server."; }
}
initialize();