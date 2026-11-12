#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const excelPkg = require("exceljs/package.json");
const mapper = require(path.join(__dirname, "..", "netlify/functions/lib/import-mapper-core.js"));
const schemas = require(path.join(__dirname, "..", "netlify/functions/lib/import-mapper-schemas.js"));
const mp = require(path.join(__dirname, "..", "netlify/functions/import-map-preview.js"));
const P = schemas.DESCRIPTORS.partner;

const FILE_NAME = "California-Partner-Network-2026-07-28.xlsx";
const B64_PATH = path.join(__dirname, "validation-inputs", FILE_NAME + ".b64");
const EXPECTED_SHEETS = ["Agents", "Escrow_Title", "Companies", "Activity_Signals", "Outreach_Actions", "Do_Not_Contact"];
const EXPECTED_DATA_COUNTS = { Agents: 10, Escrow_Title: 4, Companies: 10, Activity_Signals: 9, Outreach_Actions: 14, Do_Not_Contact: 0 };
const EXPECTED_HEADERS = {
  Agents: ["External_ID","Name","Company","Job_Title","Contact_Type","DRE_or_License_ID","License_Status","City","County","Service_Areas","Specialization","Recent_Activity_Evidence","Buyer_Side_Relevance","Estimated_Production_Tier","Website","LinkedIn_URL","Public_Email","Public_Phone","Priority_A_B_C","Partner_Potential_Score_1_100","Why_Relevant","Recommended_Next_Step","LinkedIn_Connection_Note","Confidence","Source_URL","Last_Verified_Date"],
  Escrow_Title: ["External_ID","Name","Company","Job_Title","Contact_Type","DRE_or_License_ID","License_Status","City","County","Service_Areas","Specialization","Recent_Activity_Evidence","Buyer_Side_Relevance","Estimated_Production_Tier","Website","LinkedIn_URL","Public_Email","Public_Phone","Priority_A_B_C","Partner_Potential_Score_1_100","Why_Relevant","Recommended_Next_Step","LinkedIn_Connection_Note","Confidence","Source_URL","Last_Verified_Date"],
  Companies: ["External_ID","Company_Name","Company_Type","License_or_Entity_ID","Regulator","License_Status","City","County","Website","Main_Phone","Notes","Confidence","Source_URL","Last_Verified_Date"],
  Activity_Signals: ["External_ID","Contact_Key","Signal_Type","Signal_Date","Property_or_Market","Description","Relevance","Confidence","Source_URL"],
  Outreach_Actions: ["Priority","Contact_Key","Contact_Type","Action_Type","Due_Date","Message","Reason","Status","Notes"],
  Do_Not_Contact: ["Contact_Key","Contact_Type","Do_Not_Connect","Do_Not_Message","Do_Not_Email","Reason","Source_or_Evidence","Notes"]
};

let pass = 0;
let fail = 0;
const checks = [];
function ok(name, cond, detail = "") {
  checks.push({ name, ok: !!cond, detail: cond ? "" : detail });
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.error("  ✗ " + name + (detail ? " — " + detail : "")); }
}
const clean = v => String(v == null ? "" : v).trim();

(async () => {
  try {
    const buf = Buffer.from(fs.readFileSync(B64_PATH, "utf8").trim(), "base64");
    ok("ExcelJS version is exactly 4.4.0", excelPkg.version === "4.4.0", excelPkg.version);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sheetNames = wb.worksheets.map(ws => ws.name);
    ok("Workbook opens with ExcelJS 4.4.0", wb.worksheets.length === EXPECTED_SHEETS.length, JSON.stringify(sheetNames));
    ok("Exact required sheets and order", JSON.stringify(sheetNames) === JSON.stringify(EXPECTED_SHEETS), JSON.stringify(sheetNames));

    const excelCounts = {};
    for (const name of EXPECTED_SHEETS) {
      const ws = wb.getWorksheet(name);
      ok(`${name}: worksheet exists`, !!ws);
      if (!ws) continue;
      const headers = ws.getRow(1).values.slice(1).map(clean);
      ok(`${name}: exact headers`, JSON.stringify(headers) === JSON.stringify(EXPECTED_HEADERS[name]), JSON.stringify(headers));
      const populated = [];
      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return;
        const vals = row.values.slice(1).map(clean);
        if (vals.some(Boolean)) populated.push({ rowNumber, vals });
      });
      excelCounts[name] = populated.length;
      ok(`${name}: expected data row count ${EXPECTED_DATA_COUNTS[name]}`, populated.length === EXPECTED_DATA_COUNTS[name], String(populated.length));
      const lastPopulated = populated.length ? populated[populated.length - 1].rowNumber : 1;
      ok(`${name}: no phantom populated rows`, ws.actualRowCount === lastPopulated, `actualRowCount=${ws.actualRowCount}, lastPopulated=${lastPopulated}`);
    }

    for (const name of ["Agents", "Escrow_Title", "Companies", "Activity_Signals"]) {
      const ws = wb.getWorksheet(name);
      const headers = ws.getRow(1).values.slice(1).map(clean);
      const keyIdx = headers.indexOf("External_ID") + 1;
      const keys = [];
      for (let r = 2; r <= ws.actualRowCount; r++) {
        const rowHasData = ws.getRow(r).values.slice(1).some(v => clean(v));
        if (!rowHasData) continue;
        const key = clean(ws.getCell(r, keyIdx).value);
        ok(`${name} row ${r}: required External_ID`, !!key);
        keys.push(key.toUpperCase());
      }
      ok(`${name}: unique External_ID values`, new Set(keys).size === keys.length, JSON.stringify(keys));
    }

    const contactKeys = new Set();
    for (const sheetName of ["Agents", "Escrow_Title"]) {
      const ws = wb.getWorksheet(sheetName);
      const headers = ws.getRow(1).values.slice(1).map(clean);
      const idCol = headers.indexOf("External_ID") + 1;
      for (let r = 2; r <= ws.actualRowCount; r++) {
        const id = clean(ws.getCell(r, idCol).value);
        if (id) contactKeys.add(id.toUpperCase());
      }
    }
    for (const sheetName of ["Activity_Signals", "Outreach_Actions"]) {
      const ws = wb.getWorksheet(sheetName);
      const headers = ws.getRow(1).values.slice(1).map(clean);
      const keyCol = headers.indexOf("Contact_Key") + 1;
      for (let r = 2; r <= ws.actualRowCount; r++) {
        const rowHasData = ws.getRow(r).values.slice(1).some(v => clean(v));
        if (!rowHasData) continue;
        const key = clean(ws.getCell(r, keyCol).value);
        ok(`${sheetName} row ${r}: Contact_Key resolves`, !!key && contactKeys.has(key.toUpperCase()), key);
      }
    }

    const agentWs = wb.getWorksheet("Agents");
    const agentHeaders = agentWs.getRow(1).values.slice(1).map(clean);
    const noteCol = agentHeaders.indexOf("LinkedIn_Connection_Note") + 1;
    for (let r = 2; r <= agentWs.actualRowCount; r++) {
      const note = clean(agentWs.getCell(r, noteCol).value);
      ok(`Agents row ${r}: LinkedIn note <= 300 chars`, note.length <= 300, String(note.length));
    }
    const escrowWs = wb.getWorksheet("Escrow_Title");
    const escrowHeaders = escrowWs.getRow(1).values.slice(1).map(clean);
    const escrowNoteCol = escrowHeaders.indexOf("LinkedIn_Connection_Note") + 1;
    for (let r = 2; r <= escrowWs.actualRowCount; r++) {
      const note = clean(escrowWs.getCell(r, escrowNoteCol).value);
      ok(`Escrow_Title row ${r}: LinkedIn note <= 300 chars`, note.length <= 300, String(note.length));
    }

    const sheets = (await mp._extractSheets(FILE_NAME, buf)).filter(s => (s.headers || []).some(h => clean(h)));
    ok("Production extractor recognizes all required sheets", JSON.stringify(sheets.map(s => s.name || s.sheet)) === JSON.stringify(EXPECTED_SHEETS), JSON.stringify(sheets.map(s => s.name || s.sheet)));
    for (const s of sheets) {
      const sheetName = s.name || s.sheet;
      ok(`Production extractor ${sheetName}: row count`, Array.isArray(s.rows) && s.rows.length === EXPECTED_DATA_COUNTS[sheetName], `rows=${s.rows && s.rows.length}`);
    }

    const builtin = schemas.matchBuiltinProfile(sheets, "partner");
    ok("Partner importer profile detected", !!builtin, builtin ? builtin.profile.name : "none");
    const suggestion = mapper.autoMap(sheets, P);
    if (builtin) schemas.applyBuiltinTransforms(suggestion, builtin.profile);
    const bySheet = {};
    suggestion.forEach(s => { bySheet[s.sheet] = s; });
    for (const name of EXPECTED_SHEETS) {
      if (name === "Do_Not_Contact" && EXPECTED_DATA_COUNTS[name] === 0) continue;
      ok(`${name}: mapped to correct entity`, bySheet[name] && bySheet[name].entity === name, JSON.stringify(bySheet[name] && bySheet[name].entity));
    }

    const mappingSheets = suggestion.filter(s => s.entity).map(s => ({
      sheet: s.sheet,
      entity: s.entity,
      columns: s.columns.filter(c => c.target).map(c => ({ source: c.source, sourceIndex: c.sourceIndex, target: c.target, valueMap: c.valueMap }))
    }));
    const applied = mapper.applyMapping(sheets, mappingSheets, P);
    const plannerRows = mapper.buildPlannerRows(applied.canonical, P);
    let n = 0;
    const plan = P.planActions(plannerRows, {}, {
      adminId: "00000000-0000-0000-0000-0000000000a1",
      today: "2026-07-29",
      genId: () => "00000000-0000-0000-0000-" + String(++n).padStart(12, "0")
    });
    const quality = mapper.qualityReport(applied.canonical, P);
    const counts = {};
    plan.rows.forEach(r => {
      const c = counts[r.sheet_name] = counts[r.sheet_name] || { insert: 0, invalid: 0, conflict: 0, update: 0 };
      c[r.proposed_action] = (c[r.proposed_action] || 0) + 1;
    });
    for (const [name, expected] of Object.entries(EXPECTED_DATA_COUNTS)) {
      if (expected === 0) {
        ok(`${name}: parser plans zero records`, !counts[name] || Object.values(counts[name]).reduce((a,b) => a+b, 0) === 0, JSON.stringify(counts[name]));
      } else {
        ok(`${name}: parser recognizes ${expected} records`, counts[name] && counts[name].insert === expected, JSON.stringify(counts[name]));
      }
    }
    ok("Parser blocking invalid rows: 0", plan.summary.invalid === 0, JSON.stringify(plan.summary));
    ok("Parser conflicts: 0", plan.summary.conflict === 0, JSON.stringify(plan.summary));
    ok("Missing required values: 0", quality.missingRequired.length === 0, JSON.stringify(quality.missingRequired));
    const sigs = plan.rows.filter(r => r.target_type === "activity_signal");
    const outreach = plan.rows.filter(r => r.target_type === "outreach_action");
    ok("Activity signal subject references resolved", sigs.every(r => clean(r.after_data.subject_name) && r.after_data.agent_id), JSON.stringify(sigs.map(r => r.after_data)));
    ok("Outreach subject references resolved", outreach.every(r => clean(r.after_data.subject_name) && ["agent", "escrow_title"].includes(r.after_data.subject_type)), JSON.stringify(outreach.map(r => r.after_data)));
    ok("All non-DNC source rows retain provenance", applied.provenance.length === 10 + 4 + 10 + 9 + 14, String(applied.provenance.length));

    const report = {
      file: FILE_NAME,
      exceljsVersion: excelPkg.version,
      workbookSheets: sheetNames,
      excelDataRowCounts: excelCounts,
      productionExtractedSheets: sheets.map(s => ({ sheet: s.name || s.sheet, rows: s.rows.length })),
      builtinProfile: builtin ? builtin.profile.name : null,
      parserPlanSummary: plan.summary,
      parserEntityCounts: counts,
      missingRequired: quality.missingRequired,
      pass,
      fail,
      checks
    };
    fs.writeFileSync(path.join(__dirname, "validation-inputs", "California-Partner-Network-2026-07-28-validation.json"), JSON.stringify(report, null, 2));
    console.log(`\nPASS ${pass} · FAIL ${fail}`);
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error("FATAL", e && e.stack ? e.stack : e);
    process.exit(1);
  }
})();
