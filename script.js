function summarize(rows) {
  const yearly = new Map();
  const outcomes = new Map([
    ["Substantiated", 0], ["Exonerated", 0], ["Unsubstantiated", 0], ["Other / missing", 0]
  ]);
  const races = new Map();
  for (const row of rows) {
    const race = (row.complainant_ethnicity || "").trim() || "Missing";
    races.set(race, (races.get(race) || 0) + 1);
    const year = Number(row.year_received);
    if (row.year_received && Number.isInteger(year) && row.complaint_id) {
      if (!yearly.has(year)) yearly.set(year, new Set());
      yearly.get(year).add(row.complaint_id);
    }
    const disposition = (row.board_disposition || "").trim();
    const category = disposition.startsWith("Substantiated") ? "Substantiated"
      : outcomes.has(disposition) ? disposition : "Other / missing";
    outcomes.set(category, outcomes.get(category) + 1);
  }
  return { yearly, outcomes, races };
}
const names = ["Substantiated", "Exonerated", "Unsubstantiated", "Other / missing"];
const colors = ["#28766b", "#477fa8", "#c78b40", "#888888"];

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

    function render() {
      d3.selectAll("svg").selectAll("*").remove();
      document.querySelector("#detail").textContent = "Hover or focus a bar for counts and complainant race / ethnicity.";
      const from = Number(start.property("value"));
      const through = Number(end.property("value"));
      if (from > through) { status.textContent = "Start year must be at or before end year."; return; }
      const filtered = rows.filter(row => row.year_received.trim() && Number(row.year_received) >= from && Number(row.year_received) <= through);
      const groups = summarize(filtered);
      status.textContent = from + "–" + through + ": " + filtered.length.toLocaleString() + " allegation records.";
      if (!groups.length) { status.textContent += " No matching records."; return; }
      const white = d3.select("#white-chart").attr("viewBox", "0 0 850 " + (groups.length * 26 + 60));
      const scale = d3.scaleLinear().domain([0, 1]).range([105, 710]);
      const positions = d3.scaleBand().domain(groups.map(group => group.precinct)).range([40, groups.length * 26 + 40]).padding(0.2);
      white.append("g").attr("transform", "translate(0,30)").call(d3.axisTop(scale).ticks(5).tickFormat(d3.format(".0%")));
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
      const selected = groups.filter(group => group.count >= 100 && (group.races.get("Black") || 0) / group.count > 0.5).sort((first, second) => first.outcomes[0] / first.count - second.outcomes[0] / second.count).slice(0, 5);
      const black = d3.select("#black-chart").attr("viewBox", "0 0 850 330");
      if (!selected.length) { black.append("text").attr("x", 30).attr("y", 50).text("No precincts meet this chart's selection criteria for these years."); return; }
      const rates = selected.map(group => group.outcomes[0] / group.count);
      const horizontal = d3.scaleLinear().domain([Math.max(0, d3.min(rates) - 0.01), d3.max(rates) + 0.02]).range([100, 720]);
      const vertical = d3.scaleBand().domain(selected.map(group => group.precinct)).range([30, 260]).padding(0.3);
      black.append("g").attr("transform", "translate(0,270)").call(d3.axisBottom(horizontal).ticks(5).tickFormat(d3.format(".0%")));
      black.append("g").attr("transform", "translate(95,0)").call(d3.axisLeft(vertical).tickSize(0));
      for (const group of selected) {
        const rate = group.outcomes[0] / group.count;
        black.append("rect").attr("x", 100).attr("y", vertical(group.precinct)).attr("width", horizontal(rate) - 100).attr("height", vertical.bandwidth()).attr("fill", "#a82f32");
        black.append("text").attr("x", horizontal(rate) + 8).attr("y", vertical(group.precinct) + vertical.bandwidth() / 2).attr("dominant-baseline", "middle").text(d3.format(".1%")(rate));
      }
      black.append("text").attr("x", 290).attr("y", 315).text("Allegations substantiated (%)");
    }
    render();
  } catch (error) { status.textContent = "Unable to load charts: " + error.message + " Use Live Server."; }
}
initialize();
