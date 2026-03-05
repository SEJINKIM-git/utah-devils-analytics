#!/usr/bin/env node
"use strict";

/**
 * Next.js/dev trace-ish 로그(여러 JSON 배열 + 잡텍스트 섞임)를 최대한 복구해서 분석.
 *
 * 사용:
 *   node analyze-trace.js trace.log
 *   cat trace.log | node analyze-trace.js
 *
 * 출력:
 *   콘솔에 요약(JSON) 출력
 */

// ----------------------------
// IO
// ----------------------------
const fs = require("fs");

function readAllInput() {
  const file = process.argv[2];
  if (file) return fs.readFileSync(file, "utf8");
  return fs.readFileSync(0, "utf8"); // stdin
}

// ----------------------------
// Parsing (robust extraction of JSON arrays/objects inside noisy text)
// ----------------------------

/**
 * 텍스트 안에서 JSON 배열/오브젝트 덩어리를 찾아 파싱한다.
 * - "[][...][...]" 처럼 여러 덩어리가 붙어 있어도 다 긁는다.
 * - 중간에 "// ..." 같은 잡텍스트가 있어도 통과.
 * - JSON.parse 실패하면 해당 덩어리는 스킵(최대한 복구 목적).
 */
function extractJsonChunks(text) {
  const chunks = [];
  const s = text;

  // 우리가 원하는 건 대부분 배열([...]) 이지만, 혹시 단일 object({...})도 잡아주자.
  // 단, 잡텍스트에 포함된 { } 때문에 오탐 가능성 있으니 "": 형태가 어느 정도 보이는 것만 허용.
  // 여기서는 우선 배열을 최우선으로 잡는다.
  chunks.push(...extractBalancedChunks(s, "[", "]"));
  // object도 보조로
  chunks.push(...extractBalancedChunks(s, "{", "}"));

  // 길이가 긴 것부터 파싱 시도(짧은 object 오탐 줄이기)
  chunks.sort((a, b) => b.length - a.length);

  const parsed = [];
  const seen = new Set();
  for (const chunk of chunks) {
    // 너무 작은 조각은 스킵
    if (chunk.length < 2) continue;

    // 중복 방지
    const key = chunk;
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const val = JSON.parse(chunk);
      parsed.push(val);
    } catch {
      // 실패: 스킵
    }
  }
  return parsed;
}

/**
 * 주어진 시작/끝 괄호로 "균형 잡힌" 덩어리를 모두 뽑는다.
 * 문자열 안의 괄호는 무시(따옴표 처리).
 */
function extractBalancedChunks(s, openCh, closeCh) {
  const out = [];
  const n = s.length;

  let i = 0;
  while (i < n) {
    if (s[i] !== openCh) {
      i++;
      continue;
    }
    const start = i;
    let depth = 0;
    let inStr = false;
    let esc = false;

    while (i < n) {
      const c = s[i];

      if (inStr) {
        if (esc) {
          esc = false;
        } else if (c === "\\") {
          esc = true;
        } else if (c === '"') {
          inStr = false;
        }
        i++;
        continue;
      }

      if (c === '"') {
        inStr = true;
        i++;
        continue;
      }

      if (c === openCh) depth++;
      if (c === closeCh) depth--;

      i++;

      if (depth === 0) {
        const chunk = s.slice(start, i);
        out.push(chunk);
        break;
      }
    }
    // 혹시 끝까지 갔는데 depth가 0이 안 되면(깨진 JSON) 그냥 종료
  }
  return out;
}

/**
 * 파싱된 결과에서 "이벤트 배열"만 모아 flat하게 만든다.
 */
function normalizeEvents(parsedValues) {
  const events = [];

  for (const val of parsedValues) {
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === "object" && typeof item.name === "string") {
          events.push(item);
        }
      }
    } else if (val && typeof val === "object") {
      // 단일 이벤트 object일 수 있음
      if (typeof val.name === "string") events.push(val);
    }
  }

  // (name, id, startTime, traceId) 기준으로 중복 제거
  const uniq = [];
  const seen = new Set();
  for (const e of events) {
    const k = [
      e.traceId ?? "",
      e.id ?? "",
      e.name ?? "",
      e.startTime ?? "",
      e.timestamp ?? "",
      e.duration ?? "",
    ].join("|");
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(e);
  }

  return uniq;
}

// ----------------------------
// Analysis helpers
// ----------------------------
function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function pick(obj, path, fallback = null) {
  try {
    const parts = path.split(".");
    let cur = obj;
    for (const p of parts) {
      if (cur == null) return fallback;
      cur = cur[p];
    }
    return cur == null ? fallback : cur;
  } catch {
    return fallback;
  }
}

function bytesToMB(b) {
  const n = Number(b);
  if (!Number.isFinite(n)) return null;
  return Math.round((n / (1024 * 1024)) * 10) / 10;
}

function safeStr(x) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

// ----------------------------
// Core aggregation
// ----------------------------
function analyze(events) {
  // group by traceId
  const byTrace = new Map();

  // global aggregations
  const byName = new Map(); // name -> {count, totalMs, maxMs}
  const byUrl = new Map(); // tags.url -> {count, totalMs, maxMs}
  const memorySamples = []; // from memory-usage events

  let minStart = Infinity;
  let maxEnd = -Infinity;

  for (const e of events) {
    const name = safeStr(e.name);
    const traceId = safeStr(e.traceId);
    const dur = toNum(e.duration) ?? 0;
    const startTime = toNum(e.startTime);
    const endTime = startTime != null ? startTime + dur : null;

    if (startTime != null) minStart = Math.min(minStart, startTime);
    if (endTime != null) maxEnd = Math.max(maxEnd, endTime);

    // trace grouping
    if (!byTrace.has(traceId)) byTrace.set(traceId, []);
    byTrace.get(traceId).push(e);

    // name aggregation
    if (!byName.has(name)) byName.set(name, { count: 0, totalMs: 0, maxMs: 0 });
    const nAgg = byName.get(name);
    nAgg.count += 1;
    nAgg.totalMs += dur;
    if (dur > nAgg.maxMs) nAgg.maxMs = dur;

    // url aggregation (handle-request / memory-usage 쪽 tags.url이 핵심)
    const url = pick(e, "tags.url", null);
    if (typeof url === "string" && url.length) {
      if (!byUrl.has(url)) byUrl.set(url, { count: 0, totalMs: 0, maxMs: 0 });
      const uAgg = byUrl.get(url);
      uAgg.count += 1;
      uAgg.totalMs += dur;
      if (dur > uAgg.maxMs) uAgg.maxMs = dur;
    }

    // memory samples
    if (name === "memory-usage") {
      const rss = pick(e, "tags.memory.rss", null);
      const heapUsed = pick(e, "tags.memory.heapUsed", null);
      const heapTotal = pick(e, "tags.memory.heapTotal", null);
      memorySamples.push({
        traceId,
        url: pick(e, "tags.url", null),
        startTime,
        rssBytes: toNum(rss),
        heapUsedBytes: toNum(heapUsed),
        heapTotalBytes: toNum(heapTotal),
      });
    }
  }

  // Prepare summaries
  const traces = [];
  for (const [traceId, list] of byTrace.entries()) {
    // compute trace window
    let tMin = Infinity;
    let tMax = -Infinity;
    for (const e of list) {
      const st = toNum(e.startTime);
      const dur = toNum(e.duration) ?? 0;
      if (st != null) {
        tMin = Math.min(tMin, st);
        tMax = Math.max(tMax, st + dur);
      }
    }
    const spanMs = Number.isFinite(tMin) && Number.isFinite(tMax) ? tMax - tMin : null;

    // top events in this trace
    const sorted = list
      .map((e) => ({
        name: e.name,
        duration: toNum(e.duration) ?? 0,
        url: pick(e, "tags.url", null),
        trigger: pick(e, "tags.trigger", null),
        inputPage: pick(e, "tags.inputPage", null),
      }))
      .sort((a, b) => b.duration - a.duration);

    traces.push({
      traceId,
      eventCount: list.length,
      spanMs,
      topEvents: sorted.slice(0, 8),
    });
  }

  traces.sort((a, b) => (b.spanMs ?? 0) - (a.spanMs ?? 0));

  const nameSummary = Array.from(byName.entries())
    .map(([name, v]) => ({
      name,
      count: v.count,
      totalMs: Math.round(v.totalMs),
      avgMs: v.count ? Math.round(v.totalMs / v.count) : 0,
      maxMs: Math.round(v.maxMs),
    }))
    .sort((a, b) => b.totalMs - a.totalMs);

  const urlSummary = Array.from(byUrl.entries())
    .map(([url, v]) => ({
      url,
      count: v.count,
      totalMs: Math.round(v.totalMs),
      avgMs: v.count ? Math.round(v.totalMs / v.count) : 0,
      maxMs: Math.round(v.maxMs),
    }))
    .sort((a, b) => b.maxMs - a.maxMs);

  // Memory peaks
  let peakRss = null;
  let peakHeapUsed = null;
  for (const m of memorySamples) {
    if (m.rssBytes != null) {
      if (!peakRss || m.rssBytes > peakRss.rssBytes) peakRss = m;
    }
    if (m.heapUsedBytes != null) {
      if (!peakHeapUsed || m.heapUsedBytes > peakHeapUsed.heapUsedBytes) peakHeapUsed = m;
    }
  }

  // Slow endpoints (from handle-request events via tags.url)
  const slowRequests = events
    .filter((e) => e && e.name === "handle-request" && typeof pick(e, "tags.url", null) === "string")
    .map((e) => ({
      url: pick(e, "tags.url", ""),
      durationMs: toNum(e.duration) ?? 0,
      traceId: safeStr(e.traceId),
      startTime: toNum(e.startTime),
    }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 15);

  // Slow compiles (compile-path)
  const slowCompiles = events
    .filter((e) => e && e.name === "compile-path")
    .map((e) => ({
      trigger: pick(e, "tags.trigger", null),
      durationMs: toNum(e.duration) ?? 0,
      traceId: safeStr(e.traceId),
      startTime: toNum(e.startTime),
    }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 15);

  const overallSpanMs =
    Number.isFinite(minStart) && Number.isFinite(maxEnd) ? Math.max(0, maxEnd - minStart) : null;

  return {
    meta: {
      eventsParsed: events.length,
      traceCount: byTrace.size,
      overallSpanMs,
      overallSpanSec: overallSpanMs != null ? Math.round((overallSpanMs / 1000) * 10) / 10 : null,
    },
    topByTotalTime: nameSummary.slice(0, 20),
    topByUrlMax: urlSummary.slice(0, 20),
    slowRequests,
    slowCompiles,
    memory: {
      samples: memorySamples.length,
      peakRssMB: peakRss?.rssBytes != null ? bytesToMB(peakRss.rssBytes) : null,
      peakRssAt: peakRss
        ? { url: peakRss.url, traceId: peakRss.traceId, startTime: peakRss.startTime }
        : null,
      peakHeapUsedMB: peakHeapUsed?.heapUsedBytes != null ? bytesToMB(peakHeapUsed.heapUsedBytes) : null,
      peakHeapUsedAt: peakHeapUsed
        ? { url: peakHeapUsed.url, traceId: peakHeapUsed.traceId, startTime: peakHeapUsed.startTime }
        : null,
    },
    traces: traces.slice(0, 10), // 가장 긴 trace 10개만
  };
}

// ----------------------------
// Main
// ----------------------------
(function main() {
  const text = readAllInput();

  const parsed = extractJsonChunks(text);
  const events = normalizeEvents(parsed);

  const report = analyze(events);

  // pretty print
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
})();