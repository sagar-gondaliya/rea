import { expect, it } from "vitest";

import { analyzeJavaScriptStaticSource } from "./javascriptStaticAnalysis.js";

const routeEndpoints = (source: string) =>
  analyzeJavaScriptStaticSource(source)
    .endpoints.filter(({ kind }) => kind === "route")
    .map(({ value, mechanism, interpretation }) => ({
      value,
      mechanism,
      interpretation,
    }));

it("reads exact route-property templates and leaves interpolated values unknown", () => {
  expect(
    routeEndpoints(`
      const routes = [
        { path: \`settings\`, component: Settings },
        { route: \`users/\${userId}\`, component: User },
        { path: "/login", element: login },
      ];
    `),
  ).toEqual([
    {
      value: "settings",
      mechanism: "property:path",
      interpretation: undefined,
    },
    {
      value: "/login",
      mechanism: "property:path",
      interpretation: undefined,
    },
  ]);
});

it("keeps route properties on router records exact", () => {
  expect(
    routeEndpoints(`
      const routes = [
        { path: "admin", children: [] },
        { _$: "route", path: "typed" },
      ];
    `).map(({ value, interpretation }) => [value, interpretation]),
  ).toEqual([
    ["admin", undefined],
    ["typed", undefined],
  ]);
});

it("reports path properties outside router records only as candidates", () => {
  expect(
    routeEndpoints(`
      const patch = [{ type: "set", path: "updatedAt", value: 1 }];
      const worktree = { path: "", head: "" };
      const routes = [{ path: "/bare" }];
    `),
  ).toEqual([
    {
      value: "updatedAt",
      mechanism: "property:path",
      interpretation: "candidate",
    },
    { value: "", mechanism: "property:path", interpretation: "candidate" },
    {
      value: "/bare",
      mechanism: "property:path",
      interpretation: "candidate",
    },
  ]);
});

it("scans an object's route fields once for repeated path keys", () => {
  const recordSource = (count: number) =>
    `const record = { ${Array.from({ length: count }, (_, index) => `path: "p${String(index)}"`).join(", ")} };`;
  const measure = (count: number) => {
    const started = performance.now();
    const endpoints = routeEndpoints(recordSource(count));
    return { endpoints, elapsed: performance.now() - started };
  };
  // Warm the parser so the baseline is not the cold compile of this shape.
  measure(2_000);
  const smaller = measure(2_000);
  const larger = measure(20_000);
  expect(larger.endpoints).toHaveLength(20_000);
  expect(
    larger.endpoints.every(
      ({ interpretation }) => interpretation === "candidate",
    ),
  ).toBe(true);
  // Ten times as many keys. One field scan stays near 10×. Scanning the
  // object again for every key is about 100× and still fails this bound.
  // Absolute milliseconds move with runner load; the ratio does not.
  expect(larger.elapsed).toBeLessThan(Math.max(smaller.elapsed, 1) * 50);
}, 60_000);
