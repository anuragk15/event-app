import seed from "../../data/db.json";

type Row = Record<string, any>;

export type LocalDb = {
  version: number;
  tables: Record<string, Row[]>;
  storage: Record<string, string>;
};

type Filter = { kind: "eq" | "ilike" | "in" | "not-in"; column: string; value: any };
type Order = { column: string; ascending: boolean; nullsFirst: boolean };

const API = "/api/local-db";

const TABLE_ALIAS: Record<string, string> = {
  public_profiles: "profiles",
  public_events: "events",
};

const RELATIONS: Record<string, Record<string, { table: string; fk: string }>> = {
  registrations: { events: { table: "events", fk: "event_id" } },
  form_fields: { events: { table: "events", fk: "event_id" } },
  event_modules: { events: { table: "events", fk: "event_id" } },
  event_tracking_links: { events: { table: "events", fk: "event_id" } },
  cohost_invitations: { events: { table: "events", fk: "event_id" } },
  cohosts: { events: { table: "events", fk: "event_id" } },
  event_image_library: { events: { table: "events", fk: "event_id" } },
};

const CASCADE: Record<string, string[]> = {
  events: [
    "form_fields",
    "event_modules",
    "event_tracking_links",
    "registrations",
    "event_image_library",
    "image_generation_jobs",
    "cohost_invitations",
    "cohosts",
  ],
};

const TOUCH_UPDATED_AT = new Set([
  "events",
  "event_modules",
  "event_tracking_links",
  "profiles",
  "image_generation_jobs",
  "landing_sections",
]);

let dbPromise: Promise<LocalDb> | null = null;

function emptyTables(): Record<string, Row[]> {
  return {
    profiles: [],
    events: [],
    registrations: [],
    form_fields: [],
    event_modules: [],
    event_tracking_links: [],
    cohost_invitations: [],
    cohosts: [],
    landing_sections: [],
    user_roles: [],
    event_image_library: [],
    image_generation_jobs: [],
  };
}

function normalize(raw: any): LocalDb {
  const tables = emptyTables();
  const incoming = raw?.tables && typeof raw.tables === "object" ? raw.tables : {};
  for (const [name, rows] of Object.entries(incoming)) {
    tables[name] = Array.isArray(rows) ? rows : [];
  }
  return {
    version: 1,
    tables,
    storage: raw?.storage && typeof raw.storage === "object" ? raw.storage : {},
  };
}

async function loadDb(): Promise<LocalDb> {
  try {
    const res = await fetch(API, { cache: "no-store" });
    if (res.ok) return normalize(await res.json());
  } catch {
    // Fall through to the bundled seed when the dev API is unavailable.
  }
  return normalize(structuredClone(seed));
}

function ensureDb(): Promise<LocalDb> {
  dbPromise ??= loadDb();
  return dbPromise;
}

let writeChain: Promise<void> = Promise.resolve();

function persist(db: LocalDb) {
  const job = writeChain.then(async () => {
    const body = JSON.stringify(db, null, 2);
    try {
      await fetch(API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (error) {
      console.warn("Could not write data/db.json", error);
    }
  });
  writeChain = job.then(() => undefined, () => undefined);
  return job;
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return crypto.randomUUID();
}

function resolveTable(name: string) {
  return TABLE_ALIAS[name] ?? name;
}

function splitTop(input: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let depth = 0;
  for (const ch of input) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      if (buf.trim()) parts.push(buf.trim());
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

function ilike(value: unknown, pattern: string) {
  const source = String(pattern)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, ".*")
    .replace(/_/g, ".");
  return new RegExp(`^${source}$`, "i").test(String(value ?? ""));
}

function parseInList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  const text = String(value ?? "").trim().replace(/^\(/, "").replace(/\)$/, "");
  if (!text) return [];
  return text.split(",").map((part) => part.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
}

function matches(row: Row, filters: Filter[]) {
  return filters.every((filter) => {
    const current = row[filter.column];
    if (filter.kind === "eq") return current === filter.value;
    if (filter.kind === "ilike") return ilike(current, String(filter.value ?? ""));
    if (filter.kind === "in") return parseInList(filter.value).includes(String(current));
    const blocked = parseInList(filter.value);
    return !blocked.includes(String(current));
  });
}

function compareValues(a: unknown, b: unknown, order: Order) {
  const aNull = a == null || a === "";
  const bNull = b == null || b === "";
  if (aNull || bNull) {
    if (aNull && bNull) return 0;
    if (aNull) return order.nullsFirst ? -1 : 1;
    return order.nullsFirst ? 1 : -1;
  }
  if (a < b) return order.ascending ? -1 : 1;
  if (a > b) return order.ascending ? 1 : -1;
  return 0;
}

function project(db: LocalDb, table: string, row: Row, columns: string | null) {
  const spec = columns && columns !== "*" ? columns : "*";
  if (spec === "*") return structuredClone(row);
  const out: Row = {};
  for (const part of splitTop(spec)) {
    const relation = part.match(/^(\w+)\((.*)\)$/);
    if (relation) {
      out[relation[1]] = embed(db, table, row, relation[1], relation[2]);
      continue;
    }
    if (part === "*") Object.assign(out, structuredClone(row));
    else out[part] = row[part];
  }
  return out;
}

function embed(db: LocalDb, table: string, row: Row, relation: string, columns: string) {
  const link = RELATIONS[table]?.[relation];
  if (!link) return null;
  const foreignId = row[link.fk];
  if (foreignId == null) return null;
  const related = (db.tables[link.table] ?? []).find((item) => item.id === foreignId);
  if (!related) return null;
  return project(db, link.table, related, columns);
}

function defaultsFor(table: string, row: Row): Row {
  const stamp = nowIso();
  const common: Row = { id: newId() };
  if (table === "events") {
    Object.assign(common, {
      status: "draft",
      ticket_tiers: [],
      waitlist_enabled: false,
      send_confirmation_email: true,
      send_reminder_24h: false,
      send_reminder_1h: false,
      requires_approval: false,
      created_at: stamp,
      updated_at: stamp,
    });
  } else if (table === "registrations") {
    Object.assign(common, {
      status: "registered",
      is_vip: false,
      data: {},
      checked_in_at: null,
      notes: null,
      utm: null,
      created_at: stamp,
    });
  } else if (table === "form_fields") {
    Object.assign(common, { field_type: "text", required: false, position: 0, placeholder: null });
  } else if (table === "event_modules") {
    Object.assign(common, { enabled: true, content: {}, position: 0, created_at: stamp, updated_at: stamp });
  } else if (table === "event_tracking_links") {
    Object.assign(common, { click_count: 0, utm: {}, created_at: stamp, updated_at: stamp });
  } else if (table === "cohost_invitations") {
    Object.assign(common, {
      status: "pending",
      token: newId(),
      created_at: stamp,
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      accepted_at: null,
      accepted_by: null,
    });
  } else if (table === "cohosts" || table === "event_image_library" || table === "user_roles") {
    Object.assign(common, { created_at: stamp });
  } else if (table === "profiles") {
    Object.assign(common, {
      full_name: null,
      company: null,
      company_description: null,
      company_slug: null,
      website: null,
      avatar_url: null,
      social_links: [],
      created_at: stamp,
      updated_at: stamp,
    });
  } else if (table === "landing_sections") {
    Object.assign(common, { content: {}, assets: [], updated_at: stamp });
  } else if (table === "image_generation_jobs") {
    Object.assign(common, { status: "pending", result_urls: [], created_at: stamp, updated_at: stamp });
  } else {
    Object.assign(common, { created_at: stamp });
  }
  return { ...common, ...structuredClone(row) };
}

function attendeeName(reg: Row) {
  const data = reg.data ?? {};
  return data["Full Name"] || data["Name"] || data["name"] || "Guest";
}

function attendeeEmail(reg: Row) {
  const data = reg.data ?? {};
  return String(data["Email Address"] || data["Email"] || data["email"] || "").trim().toLowerCase();
}

function rowsOf(db: LocalDb, table: string) {
  const name = resolveTable(table);
  if (!db.tables[name]) db.tables[name] = [];
  return db.tables[name];
}

class Query {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitN: number | null = null;
  private columns: string | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private action: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: any = null;
  private onConflict = "id";
  private countExact = false;
  private head = false;
  private pending: Promise<any> | null = null;

  constructor(private table: string) {}

  select(columns = "*", options?: { count?: string; head?: boolean }) {
    this.columns = columns;
    if (options?.count === "exact") this.countExact = true;
    if (options?.head) this.head = true;
    return this;
  }

  insert(payload: Row | Row[]) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Row) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: Row | Row[], options?: { onConflict?: string }) {
    this.action = "upsert";
    this.payload = payload;
    if (options?.onConflict) this.onConflict = options.onConflict;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  ilike(column: string, value: string) {
    this.filters.push({ kind: "ilike", column, value });
    return this;
  }

  in(column: string, value: any[]) {
    this.filters.push({ kind: "in", column, value });
    return this;
  }

  not(column: string, operator: string, value: any) {
    if (operator === "in") this.filters.push({ kind: "not-in", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    const ascending = options?.ascending !== false;
    this.orders.push({
      column,
      ascending,
      nullsFirst: options?.nullsFirst ?? !ascending,
    });
    return this;
  }

  limit(count: number) {
    this.limitN = count;
    return this;
  }

  single() {
    this.mode = "single";
    return this;
  }

  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    this.pending ??= this.execute();
    return this.pending.then(onfulfilled, onrejected);
  }

  private async execute() {
    const db = await ensureDb();
    try {
      if (this.action === "insert") return await this.writeInsert(db);
      if (this.action === "update") return await this.writeUpdate(db);
      if (this.action === "upsert") return await this.writeUpsert(db);
      if (this.action === "delete") return await this.writeDelete(db);
      return this.read(db);
    } catch (error: any) {
      return { data: null, error: { message: error?.message || "Local database error" }, count: null };
    }
  }

  private read(db: LocalDb) {
    let rows = rowsOf(db, this.table).filter((row) => matches(row, this.filters));
    if (this.orders.length) {
      rows = [...rows].sort((a, b) => {
        for (const order of this.orders) {
          const diff = compareValues(a[order.column], b[order.column], order);
          if (diff !== 0) return diff;
        }
        return 0;
      });
    }
    const count = rows.length;
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    const data = rows.map((row) => project(db, resolveTable(this.table), row, this.columns));
    return this.finish(data, count);
  }

  private async writeInsert(db: LocalDb) {
    const table = resolveTable(this.table);
    const inputs = Array.isArray(this.payload) ? this.payload : [this.payload];
    const created = inputs.map((row) => defaultsFor(table, row));
    rowsOf(db, table).push(...created);
    await persist(db);
    return this.finish(created.map((row) => project(db, table, row, this.columns)), created.length);
  }

  private async writeUpdate(db: LocalDb) {
    const table = resolveTable(this.table);
    const matched = rowsOf(db, table).filter((row) => matches(row, this.filters));
    const stamp = nowIso();
    for (const row of matched) {
      Object.assign(row, structuredClone(this.payload));
      if (TOUCH_UPDATED_AT.has(table)) row.updated_at = stamp;
    }
    await persist(db);
    return this.finish(matched.map((row) => project(db, table, row, this.columns)), matched.length);
  }

  private async writeUpsert(db: LocalDb) {
    const table = resolveTable(this.table);
    const inputs = Array.isArray(this.payload) ? this.payload : [this.payload];
    const stored: Row[] = [];
    const list = rowsOf(db, table);
    for (const input of inputs) {
      const next = defaultsFor(table, input);
      const key = next[this.onConflict];
      const existing = list.find((row) => row[this.onConflict] === key);
      if (existing) {
        Object.assign(existing, structuredClone(input));
        if (TOUCH_UPDATED_AT.has(table)) existing.updated_at = nowIso();
        stored.push(existing);
      } else {
        list.push(next);
        stored.push(next);
      }
    }
    await persist(db);
    return this.finish(stored.map((row) => project(db, table, row, this.columns)), stored.length);
  }

  private async writeDelete(db: LocalDb) {
    const table = resolveTable(this.table);
    const list = rowsOf(db, table);
    const removed = list.filter((row) => matches(row, this.filters));
    db.tables[table] = list.filter((row) => !matches(row, this.filters));
    if (CASCADE[table]) {
      const ids = new Set(removed.map((row) => row.id));
      for (const child of CASCADE[table]) {
        db.tables[child] = (db.tables[child] ?? []).filter((row) => !ids.has(row.event_id));
      }
    }
    await persist(db);
    return this.finish(removed.map((row) => project(db, table, row, this.columns)), removed.length);
  }

  private finish(rows: Row[], count: number) {
    if (this.head) return { data: null, error: null, count };
    if (this.mode === "single") {
      if (rows.length !== 1) {
        return {
          data: null,
          error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
          count,
        };
      }
      return { data: rows[0], error: null, count };
    }
    if (this.mode === "maybe") {
      if (rows.length > 1) {
        return {
          data: null,
          error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
          count,
        };
      }
      return { data: rows[0] ?? null, error: null, count };
    }
    return { data: rows, error: null, count: this.countExact ? count : null };
  }
}

async function rpc(fn: string, args: Record<string, any> = {}) {
  const db = await ensureDb();
  const fail = (message: string) => ({ data: null, error: { message } });
  try {
    if (fn === "has_any_organizer_access") {
      const userId = args._user_id;
      const owns = rowsOf(db, "events").some((event) => event.user_id === userId);
      const hosts = rowsOf(db, "cohosts").some((row) => row.cohost_user_id === userId);
      return { data: owns || hosts, error: null };
    }

    if (fn === "get_event_email_config") {
      const event = rowsOf(db, "events").find((row) => row.id === args.p_event_id);
      if (!event) return fail("Event not found");
      return {
        data: {
          email_intro: event.email_intro ?? null,
          email_signature: event.email_signature ?? null,
          send_confirmation_email: event.send_confirmation_email !== false,
          send_reminder_24h: !!event.send_reminder_24h,
          send_reminder_1h: !!event.send_reminder_1h,
        },
        error: null,
      };
    }

    if (fn === "update_event_email_config") {
      const event = rowsOf(db, "events").find((row) => row.id === args.p_event_id);
      if (!event) return fail("Event not found");
      const allowed = ["email_intro", "email_signature", "send_confirmation_email", "send_reminder_24h", "send_reminder_1h"];
      for (const key of allowed) {
        if (args.p_patch && key in args.p_patch) event[key] = args.p_patch[key];
      }
      event.updated_at = nowIso();
      await persist(db);
      return { data: true, error: null };
    }

    if (fn === "register_for_event") {
      const event = rowsOf(db, "events").find((row) => row.id === args.p_event_id);
      if (!event) return fail("Event not found");
      const active = rowsOf(db, "registrations").filter(
        (row) => row.event_id === event.id && row.status !== "cancelled" && row.status !== "waitlisted",
      );
      const cap = event.capacity ?? event.registration_limit;
      let status = "registered";
      let waitlisted = false;
      if (cap != null && active.length >= Number(cap)) {
        if (event.waitlist_enabled) {
          status = "waitlisted";
          waitlisted = true;
        } else {
          return fail("This event is full");
        }
      }
      const data = structuredClone(args.p_data ?? {});
      const created = defaultsFor("registrations", {
        event_id: event.id,
        data,
        utm: args.p_utm ?? null,
        status,
        is_vip: !!data.is_vip,
      });
      rowsOf(db, "registrations").push(created);
      await persist(db);
      return { data: { id: created.id, status, waitlisted }, error: null };
    }

    if (fn === "promote_from_waitlist") {
      const reg = rowsOf(db, "registrations").find((row) => row.id === args.p_registration_id);
      if (!reg) return fail("Registration not found");
      reg.status = "registered";
      await persist(db);
      return { data: true, error: null };
    }

    if (fn === "get_registration_count") {
      const count = rowsOf(db, "registrations").filter(
        (row) => row.event_id === args.p_event_id && row.status !== "cancelled",
      ).length;
      return { data: count, error: null };
    }

    if (fn === "increment_link_click") {
      const link = rowsOf(db, "event_tracking_links").find((row) => row.id === args.p_link_id);
      if (link) {
        link.click_count = Number(link.click_count || 0) + 1;
        link.updated_at = nowIso();
        await persist(db);
      }
      return { data: true, error: null };
    }

    if (fn === "get_my_tickets") {
      const email = "alex@example.com";
      const tickets = rowsOf(db, "registrations")
        .filter((row) => attendeeEmail(row) === email)
        .map((row) => {
          const event = rowsOf(db, "events").find((item) => item.id === row.event_id);
          return {
            registration_id: row.id,
            status: row.status,
            checked_in_at: row.checked_in_at,
            created_at: row.created_at,
            attendee_name: attendeeName(row),
            event_id: row.event_id,
            event_name: event?.name ?? "Event",
            event_date: event?.event_date ?? null,
            event_end_date: event?.event_end_date ?? null,
            timezone: event?.timezone ?? null,
            location_value: event?.location_value ?? null,
            location_type: event?.location_type ?? null,
            event_slug: event?.slug ?? "",
            cover_image_url: event?.background_image_url ?? null,
            primary_color: event?.primary_color ?? null,
          };
        });
      return { data: tickets, error: null };
    }

    if (fn === "get_ticket") {
      const reg = rowsOf(db, "registrations").find((row) => row.id === args.p_registration_id);
      if (!reg) return fail("Ticket not found");
      const event = rowsOf(db, "events").find((row) => row.id === reg.event_id);
      return {
        data: {
          id: reg.id,
          event_id: reg.event_id,
          status: reg.status,
          checked_in_at: reg.checked_in_at,
          attendee_name: attendeeName(reg),
          ticket_name: reg.data?.["Ticket"] ?? null,
          event_name: event?.name ?? "Event",
          event_date: event?.event_date ?? null,
          end_date: event?.event_end_date ?? null,
          timezone: event?.timezone ?? null,
          location: event?.location_value ?? null,
          location_type: event?.location_type ?? null,
          primary_color: event?.primary_color ?? null,
          cover_image_url: event?.background_image_url ?? null,
          event_slug: event?.slug ?? null,
        },
        error: null,
      };
    }

    if (fn === "check_in_attendee") {
      const reg = rowsOf(db, "registrations").find((row) => row.id === args.p_registration_id);
      if (!reg) return fail("Ticket not found");
      if (reg.status === "cancelled") return fail("This ticket was cancelled");
      if (reg.checked_in_at) {
        return {
          data: {
            event_id: reg.event_id,
            already_checked_in: true,
            attendee_name: attendeeName(reg),
            checked_in_at: reg.checked_in_at,
          },
          error: null,
        };
      }
      reg.checked_in_at = nowIso();
      reg.status = "checked_in";
      await persist(db);
      return {
        data: {
          event_id: reg.event_id,
          already_checked_in: false,
          attendee_name: attendeeName(reg),
          checked_in_at: reg.checked_in_at,
        },
        error: null,
      };
    }

    if (fn === "get_cohost_invitation") {
      const invite = rowsOf(db, "cohost_invitations").find((row) => row.token === args._token);
      if (!invite) return fail("Invitation not found");
      const event = invite.event_id ? rowsOf(db, "events").find((row) => row.id === invite.event_id) : null;
      const inviter = rowsOf(db, "profiles").find((row) => row.id === invite.inviter_id);
      return {
        data: {
          ...invite,
          event_name: event?.name ?? null,
          inviter_name: inviter?.full_name ?? null,
          inviter_company: inviter?.company ?? null,
        },
        error: null,
      };
    }

    if (fn === "accept_cohost_invitation") {
      const invite = rowsOf(db, "cohost_invitations").find((row) => row.token === args._token);
      if (!invite) return fail("Invitation not found");
      if (invite.status !== "pending") return fail(`This invitation is ${invite.status}`);
      invite.status = "accepted";
      invite.accepted_at = nowIso();
      invite.accepted_by = "00000000-0000-4000-8000-000000000001";
      rowsOf(db, "cohosts").push(
        defaultsFor("cohosts", {
          owner_id: invite.inviter_id,
          cohost_user_id: invite.accepted_by,
          event_id: invite.event_id,
        }),
      );
      await persist(db);
      return { data: { event_id: invite.event_id, scope: invite.scope }, error: null };
    }

    return fail(`${fn} is not available in the local database`);
  } catch (error: any) {
    return fail(error?.message || "Local database error");
  }
}

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const storageMirror: Record<string, string> = {};

function storageBucket(bucket: string) {
  const keyFor = (path: string) => `${bucket}/${path}`;
  return {
    upload: async (path: string, file: Blob) => {
      try {
        const db = await ensureDb();
        const url = await fileToDataUrl(file);
        db.storage[keyFor(path)] = url;
        storageMirror[keyFor(path)] = url;
        await persist(db);
        return { data: { path }, error: null };
      } catch (error: any) {
        return { data: null, error: { message: error?.message || "Upload failed" } };
      }
    },
    getPublicUrl: (path: string) => ({
      data: { publicUrl: storageMirror[keyFor(path)] || "" },
    }),
    remove: async (paths: string[]) => {
      const db = await ensureDb();
      for (const path of paths) {
        delete db.storage[keyFor(path)];
        delete storageMirror[keyFor(path)];
      }
      await persist(db);
      return { data: paths, error: null };
    },
  };
}

void ensureDb().then((database) => {
  Object.assign(storageMirror, database.storage);
});

const channelApi = {
  channel() {
    const channel = {
      on() {
        return channel;
      },
      subscribe() {
        return channel;
      },
    };
    return channel;
  },
  removeChannel() {},
};

export const localSupabase = {
  from(table: string) {
    return new Query(table);
  },
  rpc(fn: string, args?: Record<string, any>) {
    return rpc(fn, args);
  },
  functions: {
    invoke: async (name: string) => ({
      data: null,
      error: { message: `${name} isn't available in the local demo` },
    }),
  },
  storage: {
    from: storageBucket,
  },
  auth: {
    onAuthStateChange(callback: (event: string, session: null) => void) {
      void callback;
      return { data: { subscription: { unsubscribe() {} } } };
    },
    getSession: async () => ({ data: { session: null }, error: null }),
    signOut: async () => ({ error: null }),
    updateUser: async () => ({ data: { user: null }, error: null }),
    setSession: async () => ({ data: { session: null }, error: null }),
  },
  channel: channelApi.channel,
  removeChannel: channelApi.removeChannel,
};
