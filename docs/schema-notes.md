# RailNexus schema notes

Why the Oracle DDL uses the **table-per-subtype with shared primary key**
specialization/generalization pattern instead of the alternatives.

## The three classic strategies

1. **Single table inheritance (STI).** One wide `PERSON` relation with a type column
   and nullable columns for every subtype. Simple reads, terrible write semantics:
   most rows carry NULLs for the attributes of the other subtypes, and CHECK
   constraints cannot express "columns must be filled exactly for type P".
2. **Class table inheritance (CTI).** A supertype table shared by every subtype plus
   one table per subtype that reuses the supertype PK. This is what RailNexus uses.
3. **Concrete table inheritance.** No shared table at all; every subtype is standalone
   and the supertype columns are duplicated. Fastest per-type scans but impossible to
   guarantee a single identity for a person, and cross-type queries (e.g. "all
   travellers who are also employees") need UNION of everything.

## Why table-per-subtype for this system

- **Avoids NULL sprawl.** `PASSENGER` has document and contact data; `EMPLOYEE` has
  hire date, designation and base station. In STI one of the two column groups is
  always NULL for every row, which is wasteful and error-prone.
- **Enforces exact typing.** Every role really is different: a TTE has a staff id and
  shift, a station master owns a station, a zone admin owns a zone. CTI keeps each
  subtype relation free of the others' columns and lets Oracle enforce the differences
  with NOT NULL and CHECK constraints.
- **Keys are provenance.** The FK-as-PK pattern (`PASSENGER.person_id` is both PK and
  FK to `PERSON.person_id`) encodes a one-to-one total relationship, so Oracle itself
  guarantees a passenger cannot belong to two rows and every passenger row must point
  at an existing person.
- **Query efficiency.** Fetching "the employee row" never needs a join on a type
  predicate; the subtype table is physically separate. Indexing per subtype is
  compact (fewer rows, no type-filtered scans over a giant base table).
- **Cleaner auditing.** A reviewer can read a single subtype table to see exactly what
  attributes a role has instead of deciphering a discriminator + NULL matrix.

## Disjointness, total participation

- **Disjoint (a person is a passenger XOR an employee):** enforced by small `BEFORE
  INSERT` triggers on the subtype tables that read the supertype discriminator and
  count matching rows in sibling subtype tables. This is the enforcement point because
  only there can both supertype state and sibling presence be inspected.
  - *Commented alternative:* denormalize `person_type` onto the subtype tables and use
    a composite FK `(person_type, person_id)` into `PERSON(person_type, person_id)`.
    This is simpler but requires the caller to always supply the discriminator
    manually and makes an inconsistent row possible when the supertype changes.
- **Total (every person has a subtype row):** the subtype tables make `person_id` NOT
  NULL and the subtype triggers reject inserts unless the supertype row already exists,
  so a `PERSON` row without a passenger or employee row cannot be created through the
  subtype path. The remaining total-participation gap (a `PERSON` row created with no
  subtype at all) is closed in the application layer, which always inserts the subtype.

## TICKET as a state machine

`TICKET` is a generalization whose subtype can change over the ticket life-cycle:
CONFIRMED -> RAC -> WAITLISTED. RailNexus keeps the historical subtype in the
supertype (`ticket_type`) and the current status in `TICKET.status`; `booking_pkg`
moves rows between subtype tables while keeping `ticket_id` stable so the PNR never
changes. This is honest EER: the subtypes represent *states of one entity*, and the
state transitions are the interesting transactions (Phase 3).

## Notes for the academic report

- Cite this document together with `docs/eer-diagram.md` and the actual DDL
  (`db/shared_ddl/01_core_schema.sql`, `db/zone_common/booking_family.sql`).
- The same booking-family DDL is deployed verbatim into three zone schemas (Phase 2).
  That reuse is the point: one conceptual schema, horizontally fragmented by zone.
- PKs are sequence-driven for dialect compatibility; the DDL runs unchanged on Oracle
  11.2 through 23ai, which keeps the platform story simple to present.