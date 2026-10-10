# Architectural decisions log

| # | Decision | Rationale | Status |
|---|---|---|---|
| 1 | Use `oracledb` npm package (6.x) instead of `node-oracledb` | Oracle renamed the package; `node-oracledb` no longer published for 6.x. | applied |
| 2 | Frontend pinned to React 18 / Vite 5 / TS 5.5 / Tailwind 3.4 | create-vite now emits React 19 / Vite 8 / TS 6; spec recommends React 18 and a stable, well-tested toolchain is safer for the auto-built UI. | applied |
| 3 | DDL and PL/SQL target Oracle 12.1+ / 23ai, written re-runnable; docker init relies on gvenzl/oracle-free | Local 11g XE cannot host native JSON columns or partitioning; the Docker Oracle Free image is the reference runtime. Deviating to 11g everywhere would gut the syllabus features. | applied |
| 4 | Redis/Mongo never authoritative; Oracle owns seat/booking state | Master spec section 0.5. Enforced in code comments. | applied |
| 5 | Scripts are cross-platform Node (`.mjs`) not PowerShell-only | One code path for the repo on any OS. | applied |

## Deviations from source plan

- None yet besides version pinning. DBMS version gap (11g local vs 23ai target) is
  documented, not silently hidden.