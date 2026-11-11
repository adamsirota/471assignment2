function summarize(rows) {
  const yearly = new Map();
  const outcomes = new Map([
    ["Substantiated", 0], ["Exonerated", 0], ["Unsubstantiated", 0], ["Other / missing", 0]
  ]);
  for (const row of rows) {
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
  return { yearly, outcomes };
}

const check = summarize([
  { year_received: "2000", complaint_id: "one", board_disposition: "Substantiated (Charges)" },
  { year_received: "2000", complaint_id: "one", board_disposition: "Exonerated" },
  { year_received: "2001", complaint_id: "two", board_disposition: "" }
]);
if (check.yearly.get(2000).size !== 1 || check.outcomes.get("Substantiated") !== 1
    || check.outcomes.get("Other / missing") !== 1) throw new Error("Aggregation check failed");

async function initialize() {
  const status = document.querySelector("#status");
  try {
    if (!window.d3) throw new Error("D3 could not load. Check your internet connection.");
    const rows = await d3.csv("data/allegations_202007271729.csv");
    if (!rows.length || !["precinct", "complaint_id", "year_received", "board_disposition"].every(field => rows.columns.includes(field))) {
      throw new Error("The CSV is empty or missing required columns.");
    }
    const precincts = [...new Set(rows.map(row => row.precinct.trim()).filter(Boolean))]
      .sort((first, second) => Number(first) - Number(second));
    const select = d3.select("#precinct");
    select.append("option").attr("value", "all").text("All precincts");
    select.selectAll("option.precinct").data(precincts).join("option")
      .attr("class", "precinct").attr("value", precinct => precinct).text(precinct => `Precinct ${precinct}`);
    select.append("option").attr("value", "").text("Unknown precinct");
    select.property("disabled", false).on("change", render);
    const years = [...summarize(rows).yearly.keys()];
    const firstYear = Math.min(...years);
    const lastYear = Math.max(...years);

    function render() {
      const precinct = select.property("value");
      const selected = precinct === "all" ? rows : rows.filter(row => row.precinct.trim() === precinct);
      const { yearly, outcomes } = summarize(selected);
      const annual = d3.range(firstYear, lastYear + 1).map(year => ({ year, count: yearly.get(year)?.size || 0 }));
      status.textContent = `${selected.length.toLocaleString()} allegation records; ${new Set(selected.map(row => row.complaint_id).filter(Boolean)).size.toLocaleString()} unique complaints. ${firstYear}–${lastYear}.`;
      const trend = d3.select("#trend").attr("viewBox", "0 0 800 320");
      trend.selectAll("*").remove();
      trend.append("title").text(`Unique complaints received by year: ${precinct === "all" ? "all precincts" : precinct || "unknown precinct"}`);
      const horizontal = d3.scaleLinear().domain([firstYear, lastYear]).range([65, 770]);
      const vertical = d3.scaleLinear().domain([0, d3.max(annual, row => row.count) || 1]).nice().range([270, 25]);
      trend.append("g").attr("transform", "translate(0,270)").call(d3.axisBottom(horizontal).ticks(8).tickFormat(d3.format("d")));
      trend.append("g").attr("transform", "translate(65,0)").call(d3.axisLeft(vertical).ticks(5).tickFormat(d3.format("d")));
      trend.append("text").attr("x", 400).attr("y", 310).text("Year received");
      trend.append("path").datum(annual).attr("fill", "none").attr("stroke", "#246a91").attr("stroke-width", 2)
        .attr("d", d3.line().x(row => horizontal(row.year)).y(row => vertical(row.count)));
      trend.selectAll("circle").data(annual).join("circle").attr("cx", row => horizontal(row.year))
        .attr("cy", row => vertical(row.count)).attr("r", 3).attr("fill", "#246a91")
        .append("title").text(row => `${row.year}: ${row.count} complaints`);

      const distribution = [...outcomes].map(([name, count]) => ({ name, count, share: selected.length ? count / selected.length : 0 }));
      const chart = d3.select("#outcomes").attr("viewBox", "0 0 800 260");
      chart.selectAll("*").remove();
      chart.append("title").text("Allegation dispositions across all years for the selected precinct");
      const percentage = d3.scaleLinear().domain([0, 1]).range([155, 640]);
      const categories = d3.scaleBand().domain(distribution.map(row => row.name)).range([20, 210]).padding(0.3);
      chart.append("g").attr("transform", "translate(0,210)").call(d3.axisBottom(percentage).ticks(5).tickFormat(d3.format(".0%")));
      chart.append("g").attr("transform", "translate(155,0)").call(d3.axisLeft(categories).tickSize(0));
      chart.selectAll("rect").data(distribution).join("rect").attr("x", 155).attr("y", row => categories(row.name))
        .attr("width", row => percentage(row.share) - 155).attr("height", categories.bandwidth()).attr("fill", "#246a91");
      chart.selectAll("text.value").data(distribution).join("text").attr("class", "value")
        .attr("x", row => percentage(row.share) + 8).attr("y", row => categories(row.name) + categories.bandwidth() / 2)
        .attr("dominant-baseline", "middle").text(row => `${d3.format(".1%")(row.share)} (${row.count.toLocaleString()})`);
      chart.append("text").attr("x", 300).attr("y", 250).text("Share of allegation records");
    }
    render();
  } catch (error) {
    status.textContent = `Unable to display charts: ${error.message} Serve this folder with a local web server (such as VS Code Live Server).`;
  }
}

initialize();
