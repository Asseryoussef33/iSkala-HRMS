"use strict";
var HR = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/gas/main.ts
  var main_exports = {};
  __export(main_exports, {
    api: () => api,
    apiBatch: () => apiBatch,
    doGet: () => doGet,
    doPost: () => doPost,
    setup: () => setup
  });

  // src/core/zone.ts
  function makeZone(name) {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: name,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    });
    const parts = (instant) => {
      const p = {};
      for (const part of fmt.formatToParts(instant)) p[part.type] = part.value;
      return {
        y: Number(p.year),
        mo: Number(p.month),
        d: Number(p.day),
        h: Number(p.hour),
        mi: Number(p.minute),
        s: Number(p.second)
      };
    };
    const offsetMin = (instant) => {
      const p = parts(instant);
      const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
      const truncated = Math.floor(instant.getTime() / 1e3) * 1e3;
      return Math.round((asUtc - truncated) / 6e4);
    };
    return {
      name,
      localDate(instant) {
        const p = parts(instant);
        return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
      },
      localMinutes(instant) {
        const p = parts(instant);
        return p.h * 60 + p.mi;
      },
      toInstant(date2, minutes) {
        const [y, m, d] = date2.split("-").map(Number);
        const naive = Date.UTC(y, m - 1, d, 0, minutes);
        let t = naive - offsetMin(new Date(naive)) * 6e4;
        const second = offsetMin(new Date(t));
        t = naive - second * 6e4;
        return new Date(t);
      }
    };
  }

  // src/core/errors.ts
  var AppError = class extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
      this.name = "AppError";
    }
  };
  var invalid = (message) => new AppError("VALIDATION", message);
  var forbidden = (message = "You don't have permission to do this.") => new AppError("FORBIDDEN", message);
  var notFound = (what) => new AppError("NOT_FOUND", `${what} was not found.`);
  var conflict = (message) => new AppError("CONFLICT", message);
  var unauthenticated = () => new AppError("UNAUTHENTICATED", "Your session has ended. Please sign in again.");

  // src/services/context.ts
  var nowIso = (deps2) => deps2.clock.now().toISOString();
  var today = (deps2) => deps2.zone.localDate(deps2.clock.now());

  // src/services/audit.ts
  var json = (v) => v === void 0 || v === null ? null : JSON.stringify(v);
  function audit(ctx, entry) {
    var _a, _b;
    const { deps: deps2, principal } = ctx;
    deps2.store.insert("audit_logs", {
      id: deps2.crypto.uuid(),
      createdAt: nowIso(deps2),
      actorId: principal.userId,
      capacity: (_a = entry.capacity) != null ? _a : "SELF",
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: json(entry.before),
      after: json(entry.after),
      reason: (_b = entry.reason) != null ? _b : null,
      userAgent: principal.userAgent
    });
  }
  function listAudit(ctx, filter) {
    var _a;
    const limit = Math.min(Math.max((_a = filter.limit) != null ? _a : 100, 1), 500);
    return ctx.deps.store.all("audit_logs").filter((r) => (!filter.entityType || r.entityType === filter.entityType) && (!filter.entityId || r.entityId === filter.entityId)).sort((a, b) => a.createdAt < b.createdAt ? 1 : -1).slice(0, limit);
  }

  // src/core/dates.ts
  var ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
  function isIsoDate(value) {
    if (typeof value !== "string") return false;
    const m = ISO_DATE.exec(value);
    if (!m) return false;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const t = new Date(Date.UTC(y, mo - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
  }
  function toUtc(date2) {
    if (!isIsoDate(date2)) throw new Error(`Invalid date: ${String(date2)}`);
    const [y, m, d] = date2.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  function fromUtc(t) {
    return t.toISOString().slice(0, 10);
  }
  function addDays(date2, days) {
    const t = toUtc(date2);
    t.setUTCDate(t.getUTCDate() + days);
    return fromUtc(t);
  }
  function yearOf(date2) {
    return Number(date2.slice(0, 4));
  }

  // src/services/validate.ts
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function str(value, label, opts = {}) {
    var _a;
    const max = (_a = opts.max) != null ? _a : 200;
    if (value === void 0 || value === null || typeof value === "string" && value.trim() === "") {
      if (opts.optional) return null;
      throw invalid(`${label} is required.`);
    }
    if (typeof value !== "string") throw invalid(`${label} must be text.`);
    const v = value.trim();
    if (v.length > max) throw invalid(`${label} must be ${max} characters or fewer.`);
    return v;
  }
  function email(value, label = "Email") {
    const v = str(value, label, { max: 254 }).toLowerCase();
    if (!EMAIL.test(v)) throw invalid(`${label} is not a valid email address.`);
    return v;
  }
  function date(value, label) {
    if (!isIsoDate(value)) throw invalid(`${label} must be a valid date (YYYY-MM-DD).`);
    return value;
  }
  function optionalDate(value, label) {
    if (value === void 0 || value === null || value === "") return null;
    return date(value, label);
  }
  function oneOf(value, allowed, label) {
    if (typeof value !== "string" || !allowed.includes(value)) {
      throw invalid(`${label} must be one of: ${allowed.join(", ")}.`);
    }
    return value;
  }
  function reason(value) {
    return str(value, "A reason for this change", { max: 500 });
  }
  function obj(value, label = "Request") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid(`${label} is malformed.`);
    return value;
  }

  // src/services/auth.ts
  var MIN = 6e4;
  var GENERIC_SENT = "If this email is registered, we sent a 6-digit code to it.";
  function pepper(deps2) {
    const p = deps2.settings.get("AUTH_PEPPER");
    if (!p || p.length < 32) throw new Error("AUTH_PEPPER is missing. Run setup() first.");
    return p;
  }
  var codeHash = (deps2, email2, code) => deps2.crypto.sha256Hex(`${pepper(deps2)}|code|${email2}|${code}`);
  var tokenHash = (deps2, token) => deps2.crypto.sha256Hex(`${pepper(deps2)}|session|${token}`);
  function safeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }
  function activeUserByEmail(deps2, email2) {
    return deps2.store.all("users").find((u) => u.email === email2 && u.isActive);
  }
  function requestCode(deps2, policy, rawEmail) {
    const email2 = email(rawEmail, "Work email");
    return deps2.lock.run(() => {
      const user = activeUserByEmail(deps2, email2);
      if (!user) return { message: GENERIC_SENT };
      const now = deps2.clock.now().getTime();
      const recent = deps2.store.all("login_codes").filter((c) => c.email === email2 && now - Date.parse(c.createdAt) < 15 * MIN);
      if (recent.length >= policy.auth.codesPer15Min) {
        throw new AppError("RATE_LIMITED", "Too many codes requested. Please wait 15 minutes and try again.");
      }
      if (deps2.mailer.remainingQuota() < 1) {
        throw new AppError("EMAIL_QUOTA", "Today's email limit is used up. Please contact HR.");
      }
      const code = deps2.crypto.randomDigits(6);
      deps2.store.insert("login_codes", {
        id: deps2.crypto.uuid(),
        email: email2,
        codeHash: codeHash(deps2, email2, code),
        expiresAt: new Date(now + policy.auth.codeTtlMin * MIN).toISOString(),
        attempts: 0,
        usedAt: null,
        createdAt: new Date(now).toISOString()
      });
      deps2.mailer.send({
        to: email2,
        subject: `${code} is your iSkala HR sign-in code`,
        text: `Your sign-in code is ${code}.

It expires in ${policy.auth.codeTtlMin} minutes. If you didn't try to sign in, you can ignore this email.`
      });
      return { message: GENERIC_SENT };
    });
  }
  function verifyCode(deps2, policy, input) {
    const email2 = email(input.email, "Work email");
    const code = typeof input.code === "string" ? input.code.replace(/\s/g, "") : "";
    if (!/^\d{6}$/.test(code)) throw invalid("Enter the 6-digit code from your email.");
    const result = deps2.lock.run(() => {
      const now = deps2.clock.now().getTime();
      const bad = new AppError("INVALID_CODE", "That code is not valid or has expired. Request a new one.");
      const candidates = deps2.store.all("login_codes").filter((c) => c.email === email2 && !c.usedAt && Date.parse(c.expiresAt) > now).sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
      const latest = candidates[0];
      if (!latest) return bad;
      if (latest.attempts >= policy.auth.codeMaxAttempts) {
        return new AppError("INVALID_CODE", "Too many wrong attempts. Request a new code.");
      }
      if (!safeEqual(latest.codeHash, codeHash(deps2, email2, code))) {
        deps2.store.update("login_codes", latest.id, { attempts: latest.attempts + 1 });
        return bad;
      }
      const user = activeUserByEmail(deps2, email2);
      if (!user) return bad;
      const nowIso2 = new Date(now).toISOString();
      deps2.store.update("login_codes", latest.id, { usedAt: nowIso2 });
      const token = deps2.crypto.randomToken();
      const ttl = input.remember === true ? policy.auth.rememberDays * 24 * 60 * MIN : policy.auth.sessionHours * 60 * MIN;
      const expiresAt = new Date(now + ttl).toISOString();
      deps2.store.insert("sessions", {
        id: deps2.crypto.uuid(),
        userId: user.id,
        tokenHash: tokenHash(deps2, token),
        createdAt: nowIso2,
        expiresAt,
        revokedAt: null,
        userAgent: input.userAgent ? input.userAgent.slice(0, 300) : null
      });
      deps2.store.update("users", user.id, { lastLoginAt: nowIso2 });
      return { token, expiresAt };
    });
    if (result instanceof AppError) throw result;
    return result;
  }
  function activeRoles(deps2, userId) {
    return deps2.store.all("user_roles").filter((r) => r.userId === userId && !r.revokedAt).map((r) => r.role);
  }
  function resolveSession(deps2, token, userAgent) {
    if (typeof token !== "string" || token.length < 32 || token.length > 200) throw unauthenticated();
    const hash = tokenHash(deps2, token);
    const now = deps2.clock.now().getTime();
    const session = deps2.store.all("sessions").find((s) => safeEqual(s.tokenHash, hash) && !s.revokedAt && Date.parse(s.expiresAt) > now);
    if (!session) throw unauthenticated();
    const user = deps2.store.all("users").find((u) => u.id === session.userId);
    if (!user || !user.isActive) throw unauthenticated();
    return { userId: user.id, email: user.email, employeeId: user.employeeId, roles: activeRoles(deps2, user.id), userAgent };
  }
  function logout(deps2, token) {
    if (typeof token !== "string") return;
    const hash = tokenHash(deps2, token);
    deps2.lock.run(() => {
      const s = deps2.store.all("sessions").find((x) => x.tokenHash === hash && !x.revokedAt);
      if (s) deps2.store.update("sessions", s.id, { revokedAt: deps2.clock.now().toISOString() });
    });
  }
  function revokeAllSessions(deps2, userId) {
    const nowIso2 = deps2.clock.now().toISOString();
    const open = deps2.store.all("sessions").filter((s) => s.userId === userId && !s.revokedAt);
    for (const s of open) deps2.store.update("sessions", s.id, { revokedAt: nowIso2 });
    return open.length;
  }

  // src/services/authz.ts
  var GRANTS = {
    "employee.read.any": ["HR", "CEO"],
    "employee.write": ["HR", "CEO"],
    "department.write": ["HR", "CEO"],
    "holiday.write": ["HR", "CEO"],
    "schedule.read": ["HR", "CEO", "ADMIN"],
    "roles.write": ["CEO", "ADMIN"],
    "audit.read": ["HR", "CEO", "ADMIN"],
    "policy.read": ["HR", "CEO", "ADMIN"],
    "policy.write": ["CEO", "ADMIN"],
    "leave.read.any": ["HR", "CEO"],
    "leave.approve.any": ["HR", "CEO"],
    "leave.manage": ["HR", "CEO"]
  };
  function can(p, action) {
    return p.roles.some((r) => GRANTS[action].includes(r));
  }
  function authorize(p, action) {
    if (!can(p, action)) throw forbidden();
  }
  function canReadEmployee(p, target) {
    if (target.id === p.employeeId) return true;
    if (can(p, "employee.read.any")) return true;
    return p.roles.includes("SUPERVISOR") && p.employeeId !== null && target.managerId === p.employeeId;
  }

  // src/data/rows.ts
  var ROLES = ["EMPLOYEE", "SUPERVISOR", "HR", "CEO", "ADMIN"];
  var EMPLOYMENT_STATUSES = ["PROBATION", "ACTIVE", "ON_NOTICE", "TERMINATED"];

  // src/services/org.ts
  function listDepartments(ctx) {
    return ctx.deps.store.all("departments").filter((d) => !d.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
  }
  function createDepartment(ctx, input) {
    authorize(ctx.principal, "department.write");
    const name = str(input.name, "Department name", { max: 80 });
    const code = str(input.code, "Department code", { max: 20 }).toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(code)) throw invalid("Department code can only use letters, numbers, - and _.");
    const { deps: deps2 } = ctx;
    return deps2.lock.run(() => {
      const existing = listDepartments(ctx);
      if (existing.some((d) => d.code === code)) throw conflict(`Department code ${code} is already used.`);
      if (existing.some((d) => d.name.toLowerCase() === name.toLowerCase())) throw conflict(`A department named ${name} already exists.`);
      const at = nowIso(deps2);
      const row = deps2.store.insert("departments", {
        id: deps2.crypto.uuid(),
        name,
        code,
        createdAt: at,
        updatedAt: at,
        deletedAt: null
      });
      audit(ctx, { action: "DEPARTMENT.CREATE", entityType: "department", entityId: row.id, after: row });
      return row;
    });
  }
  function listSchedules(ctx) {
    return ctx.deps.store.all("work_schedules").filter((s) => !s.deletedAt);
  }
  function requireSchedule(ctx, id) {
    const s = listSchedules(ctx).find((x) => x.id === id);
    if (!s) throw notFound("Work schedule");
    return s;
  }
  function defaultSchedule(ctx) {
    const s = listSchedules(ctx).find((x) => x.isDefault);
    if (!s) throw new Error("No default work schedule. Run setup().");
    return s;
  }

  // src/services/employees.ts
  var activeEmployees = (ctx) => ctx.deps.store.all("employees").filter((e) => !e.deletedAt);
  function requireEmployee(ctx, id) {
    const e = activeEmployees(ctx).find((x) => x.id === id);
    if (!e) throw notFound("Employee");
    return e;
  }
  function requireDepartment(ctx, id) {
    if (!listDepartments(ctx).some((d) => d.id === id)) throw invalid("Choose a valid department.");
    return id;
  }
  function assertValidManager(ctx, employeeId, managerId) {
    const all = activeEmployees(ctx);
    const byId = new Map(all.map((e) => [e.id, e]));
    const mgr = byId.get(managerId);
    if (!mgr || mgr.employmentStatus === "TERMINATED") throw invalid("Choose an active employee as manager.");
    if (employeeId === null) return;
    for (let cur = mgr, hops = 0; cur && hops < 100; cur = cur.managerId ? byId.get(cur.managerId) : void 0, hops++) {
      if (cur.id === employeeId) throw invalid("That manager reports to this employee, which would create a loop.");
    }
  }
  function openRow(ctx, table, employeeId) {
    return ctx.deps.store.all(table).find((r) => r.employeeId === employeeId && !r.effectiveTo);
  }
  function changeHistory(ctx, table, employeeId, field, value, from, why) {
    const { deps: deps2 } = ctx;
    const open = openRow(ctx, table, employeeId);
    if (open && open[field] === value) return false;
    if (open && from <= open.effectiveFrom) {
      throw invalid(`The change must start after ${open.effectiveFrom}, when the current value began.`);
    }
    if (open) deps2.store.update(table, open.id, { effectiveTo: from });
    deps2.store.insert(table, {
      id: deps2.crypto.uuid(),
      employeeId,
      [field]: value,
      effectiveFrom: from,
      effectiveTo: null,
      changedById: ctx.principal.userId,
      reason: why,
      createdAt: nowIso(deps2)
    });
    return true;
  }
  function createEmployee(ctx, input) {
    authorize(ctx.principal, "employee.write");
    const { deps: deps2 } = ctx;
    const employeeCode = str(input.employeeCode, "Employee ID", { max: 30 }).toUpperCase();
    const fullName = str(input.fullName, "Full name", { max: 120 });
    const mail = email(input.email, "Work email");
    const phone = str(input.phone, "Phone", { max: 30, optional: true });
    const jobTitle = str(input.jobTitle, "Job title", { max: 120 });
    const officeLocation = str(input.officeLocation, "Office", { max: 80, optional: true });
    const hireDate = date(input.hireDate, "Hire date");
    const probationEndDate = optionalDate(input.probationEndDate, "Probation end date");
    if (probationEndDate && probationEndDate <= hireDate) throw invalid("Probation must end after the hire date.");
    const birthDate = checkBirth(optionalDate(input.birthDate, "Birth date"), hireDate);
    const contractType = oneOf(input.contractType || "FULL_TIME", CONTRACT_TYPES, "Contract type");
    const gender = oneOf(input.gender, GENDERS, "Gender");
    const companyAssets = str(input.companyAssets, "Company assets", { max: 300, optional: true });
    const notes = str(input.notes, "Notes", { max: 2000, optional: true });
    return deps2.lock.run(() => {
      const departmentId = requireDepartment(ctx, input.departmentId);
      const managerId = input.managerId ? String(input.managerId) : null;
      if (managerId) assertValidManager(ctx, null, managerId);
      const schedule = input.scheduleId ? requireSchedule(ctx, String(input.scheduleId)) : defaultSchedule(ctx);
      const all = activeEmployees(ctx);
      if (all.some((e) => e.employeeCode === employeeCode)) throw conflict(`Employee ID ${employeeCode} is already used.`);
      if (all.some((e) => e.email === mail) || deps2.store.all("users").some((u) => u.email === mail)) {
        throw conflict(`${mail} is already registered.`);
      }
      const at = nowIso(deps2);
      const employeeId = deps2.crypto.uuid();
      const userId = deps2.crypto.uuid();
      const status = probationEndDate ? "PROBATION" : "ACTIVE";
      const employee = deps2.store.insert("employees", {
        id: employeeId,
        employeeCode,
        userId,
        fullName,
        email: mail,
        phone,
        jobTitle,
        departmentId,
        managerId,
        officeLocation,
        hireDate,
        endDate: null,
        employmentStatus: status,
        probationEndDate,
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
        birthDate,
        contractType,
        companyAssets,
        notes,
        gender
      });
      deps2.store.insert("users", {
        id: userId,
        email: mail,
        employeeId,
        isActive: true,
        lastLoginAt: null,
        createdAt: at,
        updatedAt: at
      });
      deps2.store.insert("user_roles", {
        id: deps2.crypto.uuid(),
        userId,
        role: "EMPLOYEE",
        grantedAt: at,
        grantedById: ctx.principal.userId,
        revokedAt: null,
        revokedById: null
      });
      const hist = { employeeId, effectiveFrom: hireDate, effectiveTo: null, changedById: ctx.principal.userId, reason: "Hired", createdAt: at };
      deps2.store.insert("employee_department_history", { id: deps2.crypto.uuid(), departmentId, ...hist });
      deps2.store.insert("employment_status_history", { id: deps2.crypto.uuid(), status, ...hist });
      deps2.store.insert("employee_schedule_assignments", { id: deps2.crypto.uuid(), scheduleId: schedule.id, ...hist });
      if (managerId) deps2.store.insert("employee_managers", { id: deps2.crypto.uuid(), managerId, ...hist });
      audit(ctx, { action: "EMPLOYEE.CREATE", entityType: "employee", entityId: employeeId, after: employee });
      return employee;
    });
  }
  var CONTRACT_TYPES = ["FULL_TIME", "PART_TIME", "PROJECT"];
  var GENDERS = ["MALE", "FEMALE"];
  function checkBirth(bd, hireDate) {
    if (!bd) return bd;
    if (bd >= hireDate) throw invalid("Birth date must be before the hire date.");
    if (bd < "1930-01-01") throw invalid("Birth date looks wrong. Please check the year.");
    return bd;
  }
  function photoMap(ctx) {
    const map = new Map();
    for (const r of ctx.deps.store.all("employee_photos")) if (r.photo) map.set(r.employeeId, r.photo);
    return map;
  }
  function shapeEmployee(ctx, e, photos) {
    const out = { ...e, photo: (photos || photoMap(ctx)).get(e.id) || null };
    if (!can(ctx.principal, "employee.read.any")) delete out.notes;
    return out;
  }
  function setPhoto(ctx, input) {
    const e = requireEmployee(ctx, input.id);
    if (e.id !== ctx.principal.employeeId && !can(ctx.principal, "employee.write")) throw forbidden();
    let photo = null;
    if (input.photo !== null && input.photo !== void 0 && input.photo !== "") {
      if (typeof input.photo !== "string" || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(input.photo)) throw invalid("The photo could not be read. Please try another image.");
      if (input.photo.length > 45e3) throw invalid("The photo is too large. Please try another image.");
      photo = input.photo;
    }
    const { deps: deps2 } = ctx;
    return deps2.lock.run(() => {
      const existing = deps2.store.all("employee_photos").find((r) => r.employeeId === e.id);
      const at = nowIso(deps2);
      if (existing) deps2.store.update("employee_photos", existing.id, { photo, updatedById: ctx.principal.userId, updatedAt: at });
      else deps2.store.insert("employee_photos", { id: deps2.crypto.uuid(), employeeId: e.id, photo, updatedById: ctx.principal.userId, updatedAt: at });
      audit(ctx, { action: photo ? "EMPLOYEE.PHOTO.SET" : "EMPLOYEE.PHOTO.REMOVE", entityType: "employee", entityId: e.id });
      return { photo };
    });
  }
  function listEmployees(ctx) {
    const photos = photoMap(ctx);
    return activeEmployees(ctx).filter((e) => canReadEmployee(ctx.principal, e)).sort((a, b) => a.fullName.localeCompare(b.fullName)).map((e) => shapeEmployee(ctx, e, photos));
  }
  function getEmployee(ctx, id) {
    const e = requireEmployee(ctx, id);
    if (!canReadEmployee(ctx.principal, e)) throw forbidden();
    const { store } = ctx.deps;
    const mine = (t) => store.all(t).filter((r) => r.employeeId === e.id).sort((a, b) => a.effectiveFrom < b.effectiveFrom ? 1 : -1);
    const full = can(ctx.principal, "employee.read.any");
    return {
      employee: shapeEmployee(ctx, e),
      roles: full && e.userId ? activeRoles(ctx.deps, e.userId) : [],
      managers: mine("employee_managers"),
      departments: mine("employee_department_history"),
      statuses: full ? mine("employment_status_history") : [],
      schedules: mine("employee_schedule_assignments")
    };
  }
  function updateDetails(ctx, input) {
    authorize(ctx.principal, "employee.write");
    const why = reason(input.reason);
    const { deps: deps2 } = ctx;
    return deps2.lock.run(() => {
      var _a;
      const before = requireEmployee(ctx, input.id);
      const c = (_a = input.changes) != null ? _a : {};
      const patch = {};
      if ("fullName" in c) patch.fullName = str(c.fullName, "Full name", { max: 120 });
      if ("jobTitle" in c) patch.jobTitle = str(c.jobTitle, "Job title", { max: 120 });
      if ("phone" in c) patch.phone = str(c.phone, "Phone", { max: 30, optional: true });
      if ("officeLocation" in c) patch.officeLocation = str(c.officeLocation, "Office", { max: 80, optional: true });
      if ("probationEndDate" in c) patch.probationEndDate = optionalDate(c.probationEndDate, "Probation end date");
      if ("employeeCode" in c) {
        const code = str(c.employeeCode, "Employee ID", { max: 30 }).toUpperCase();
        if (code !== before.employeeCode) {
          if (activeEmployees(ctx).some((x) => x.id !== before.id && x.employeeCode === code)) throw conflict(`Employee ID ${code} is already used.`);
          patch.employeeCode = code;
        }
      }
      if ("contractType" in c) patch.contractType = oneOf(c.contractType, CONTRACT_TYPES, "Contract type");
      if ("gender" in c) patch.gender = oneOf(c.gender, GENDERS, "Gender");
      if ("companyAssets" in c) patch.companyAssets = str(c.companyAssets, "Company assets", { max: 300, optional: true });
      if ("notes" in c) patch.notes = str(c.notes, "Notes", { max: 2000, optional: true });
      if ("birthDate" in c) patch.birthDate = optionalDate(c.birthDate, "Birth date");
      let hireShift = null;
      if ("hireDate" in c) {
        const hd = date(c.hireDate, "Hire date");
        if (hd > today(deps2)) throw invalid("Hire date cannot be in the future.");
        if (hd !== before.hireDate) {
          const hist = ["employee_managers", "employee_department_history", "employment_status_history", "employee_schedule_assignments"];
          const later = hist.flatMap((t) => deps2.store.all(t).filter((r) => r.employeeId === before.id && r.effectiveFrom !== before.hireDate));
          if (later.some((r) => r.effectiveFrom <= hd)) throw invalid("The new hire date is after a later change in this employee's history. Pick an earlier date.");
          patch.hireDate = hd;
          hireShift = { from: before.hireDate, to: hd, tables: hist };
        }
      }
      const hireNow = patch.hireDate || before.hireDate;
      const probNow = "probationEndDate" in patch ? patch.probationEndDate : before.probationEndDate;
      if (probNow && probNow <= hireNow) throw invalid("Probation must end after the hire date.");
      checkBirth("birthDate" in patch ? patch.birthDate : before.birthDate, hireNow);
      if (hireShift) {
        for (const t of hireShift.tables) {
          for (const r of deps2.store.all(t)) {
            if (r.employeeId === before.id && r.effectiveFrom === hireShift.from) deps2.store.update(t, r.id, { effectiveFrom: hireShift.to });
          }
        }
      }
      if ("email" in c) {
        const mail = email(c.email, "Work email");
        if (mail !== before.email) {
          const users = deps2.store.all("users");
          if (users.some((u) => u.email === mail)) throw conflict(`${mail} is already registered.`);
          patch.email = mail;
          if (before.userId) {
            deps2.store.update("users", before.userId, { email: mail, updatedAt: nowIso(deps2) });
            revokeAllSessions(deps2, before.userId);
          }
        }
      }
      if (Object.keys(patch).length === 0) throw invalid("Nothing to change.");
      const after = deps2.store.update("employees", before.id, { ...patch, updatedAt: nowIso(deps2) });
      audit(ctx, { action: "EMPLOYEE.UPDATE", entityType: "employee", entityId: before.id, before, after, reason: why });
      return after;
    });
  }
  function changeAssignment(ctx, input) {
    authorize(ctx.principal, "employee.write");
    const why = reason(input.reason);
    const from = date(input.effectiveFrom, "Effective date");
    const { deps: deps2 } = ctx;
    if (from > today(deps2)) throw invalid("Changes can start today at the latest. Future-dated changes are not supported yet.");
    return deps2.lock.run(() => {
      const before = requireEmployee(ctx, input.id);
      if (from < before.hireDate) throw invalid("The change cannot start before the hire date.");
      const patch = {};
      let changed = false;
      if (input.departmentId !== void 0) {
        const dep = requireDepartment(ctx, input.departmentId);
        if (changeHistory(ctx, "employee_department_history", before.id, "departmentId", dep, from, why)) {
          patch.departmentId = dep;
          changed = true;
        }
      }
      if (input.managerId !== void 0 && input.managerId !== null && input.managerId !== "") {
        const mgr = String(input.managerId);
        assertValidManager(ctx, before.id, mgr);
        if (changeHistory(ctx, "employee_managers", before.id, "managerId", mgr, from, why)) {
          patch.managerId = mgr;
          changed = true;
        }
      }
      if (input.scheduleId !== void 0) {
        const s = requireSchedule(ctx, String(input.scheduleId));
        if (changeHistory(ctx, "employee_schedule_assignments", before.id, "scheduleId", s.id, from, why)) changed = true;
      }
      if (!changed) throw invalid("Nothing to change.");
      const after = deps2.store.update("employees", before.id, { ...patch, updatedAt: nowIso(deps2) });
      audit(ctx, { action: "EMPLOYEE.ASSIGNMENT", entityType: "employee", entityId: before.id, before, after, reason: why });
      return after;
    });
  }
  var TRANSITIONS = {
    PROBATION: ["ACTIVE", "ON_NOTICE", "TERMINATED"],
    ACTIVE: ["ON_NOTICE", "TERMINATED"],
    ON_NOTICE: ["ACTIVE", "TERMINATED"],
    TERMINATED: []
  };
  function setStatus(ctx, input) {
    authorize(ctx.principal, "employee.write");
    const status = oneOf(input.status, EMPLOYMENT_STATUSES, "Status");
    const why = reason(input.reason);
    const from = date(input.effectiveFrom, status === "TERMINATED" ? "Last working day" : "Effective date");
    const { deps: deps2 } = ctx;
    if (from > today(deps2)) throw invalid("Status changes can start today at the latest.");
    return deps2.lock.run(() => {
      const before = requireEmployee(ctx, input.id);
      if (!TRANSITIONS[before.employmentStatus].includes(status)) {
        throw invalid(`An employee who is ${before.employmentStatus.toLowerCase().replace("_", " ")} cannot move to ${status.toLowerCase().replace("_", " ")}.`);
      }
      if (before.id === ctx.principal.employeeId) throw forbidden("You cannot change your own employment status.");
      const historyFrom = status === "TERMINATED" ? addDays(from, 1) : from;
      if (from < before.hireDate) throw invalid("The date cannot be before the hire date.");
      changeHistory(ctx, "employment_status_history", before.id, "status", status, historyFrom, why);
      const patch = { employmentStatus: status, updatedAt: nowIso(deps2) };
      if (status === "TERMINATED") {
        patch.endDate = from;
        if (before.userId) {
          deps2.store.update("users", before.userId, { isActive: false, updatedAt: nowIso(deps2) });
          revokeAllSessions(deps2, before.userId);
        }
      }
      const after = deps2.store.update("employees", before.id, patch);
      audit(ctx, { action: "EMPLOYEE.STATUS", entityType: "employee", entityId: before.id, before, after, reason: why });
      return after;
    });
  }
  function setRoles(ctx, input) {
    authorize(ctx.principal, "roles.write");
    const why = reason(input.reason);
    if (!Array.isArray(input.roles)) throw invalid("Roles must be a list.");
    const wanted = new Set(input.roles.map((r) => oneOf(r, ROLES, "Role")));
    wanted.add("EMPLOYEE");
    const { deps: deps2 } = ctx;
    return deps2.lock.run(() => {
      const user = deps2.store.all("users").find((u) => u.id === input.userId);
      if (!user) throw notFound("User");
      const current = deps2.store.all("user_roles").filter((r) => r.userId === user.id && !r.revokedAt);
      const before = current.map((r) => r.role).sort();
      const at = nowIso(deps2);
      const remainingAdmins = deps2.store.all("user_roles").filter((r) => !r.revokedAt && (r.role === "CEO" || r.role === "ADMIN") && (r.userId !== user.id || wanted.has(r.role)) && deps2.store.all("users").some((u) => u.id === r.userId && u.isActive));
      if (remainingAdmins.length === 0) throw invalid("At least one active CEO or Admin must remain.");
      for (const r of current) {
        if (!wanted.has(r.role)) deps2.store.update("user_roles", r.id, { revokedAt: at, revokedById: ctx.principal.userId });
      }
      for (const role of wanted) {
        if (!current.some((r) => r.role === role)) {
          deps2.store.insert("user_roles", {
            id: deps2.crypto.uuid(),
            userId: user.id,
            role,
            grantedAt: at,
            grantedById: ctx.principal.userId,
            revokedAt: null,
            revokedById: null
          });
        }
      }
      const after = [...wanted].sort();
      audit(ctx, { action: "USER.ROLES", entityType: "user", entityId: user.id, before, after, reason: why });
      return after;
    });
  }

  // src/services/holidays.ts
  var active = (ctx) => ctx.deps.store.all("public_holidays").filter((h) => !h.deletedAt);
  function listHolidays(ctx, year) {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 2e3 || y > 2100) throw invalid("Choose a valid year.");
    return active(ctx).filter((h) => yearOf(h.date) === y).sort((a, b) => a.date < b.date ? -1 : 1);
  }
  function addHoliday(ctx, input) {
    authorize(ctx.principal, "holiday.write");
    const d = date(input.date, "Holiday date");
    const name = str(input.name, "Holiday name", { max: 80 });
    const groupKey = str(input.groupKey, "Group", { max: 60, optional: true });
    const { deps: deps2 } = ctx;
    return deps2.lock.run(() => {
      const clash = active(ctx).find((h) => h.date === d);
      if (clash) throw conflict(`${d} is already a holiday (${clash.name}).`);
      const row = deps2.store.insert("public_holidays", {
        id: deps2.crypto.uuid(),
        date: d,
        name,
        groupKey,
        createdById: ctx.principal.userId,
        createdAt: nowIso(deps2),
        deletedAt: null,
        deletedById: null,
        deleteReason: null
      });
      audit(ctx, { action: "HOLIDAY.ADD", entityType: "holiday", entityId: row.id, after: row });
      return row;
    });
  }
  function removeHoliday(ctx, input) {
    authorize(ctx.principal, "holiday.write");
    const why = reason(input.reason);
    const { deps: deps2 } = ctx;
    return deps2.lock.run(() => {
      const before = active(ctx).find((h) => h.id === input.id);
      if (!before) throw notFound("Holiday");
      const after = deps2.store.update("public_holidays", before.id, {
        deletedAt: nowIso(deps2),
        deletedById: ctx.principal.userId,
        deleteReason: why
      });
      audit(ctx, { action: "HOLIDAY.REMOVE", entityType: "holiday", entityId: before.id, before, after, reason: why });
      return after;
    });
  }

  // src/policy/config.ts
  var DEFAULT_POLICY = {
    timezone: "Africa/Cairo",
    presence: { earlyArrivalCountsFrom: "WINDOW_START" },
    leave: {
      tenureMonths: 3,
      regularDays: 15,
      casualDays: 6,
      roundingStep: 0.5,
      carryoverMaxRegular: 5,
      casualAutoApprove: true,
      allowHalfDay: false,
      notice: {
        tiers: [
          { maxWorkingDays: 3, noticeBusinessDays: 1 },
          { maxWorkingDays: null, noticeBusinessDays: 3 }
        ],
        submissionCutoffMin: null
      },
      sick: { paidDays: 5 },
      paternity: { days: 3, windowDays: 30 },
      bereavement: { days: 3 },
      maternity: { days: 120 }
    },
    earlyLeave: { perMonth: 4, maxMinutes: 60, perWeek: 1 },
    wfh: { perWeek: 1, tenureMonths: 3, blockThursdaySundayBridge: true },
    dayInLieu: { expiryDays: 30 },
    auth: { codeTtlMin: 10, codeMaxAttempts: 5, codesPer15Min: 3, sessionHours: 12, rememberDays: 7 }
  };
  var isNonNegInt = (v) => Number.isInteger(v) && v >= 0;
  function validatePolicy(p) {
    const errors = [];
    const need = (ok, msg) => {
      if (!ok) errors.push(msg);
    };
    need(typeof p.timezone === "string" && p.timezone.length > 0, "Time zone is required.");
    need(isNonNegInt(p.leave.tenureMonths), "Leave eligibility must be a whole number of months.");
    need(p.leave.regularDays >= 0 && p.leave.casualDays >= 0, "Leave entitlements cannot be negative.");
    need([0.5, 1].includes(p.leave.roundingStep), "Rounding step must be 0.5 or 1.");
    need(p.leave.carryoverMaxRegular >= 0, "Carryover cap cannot be negative.");
    const tiers = p.leave.notice.tiers;
    need(
      tiers.length > 0 && tiers[tiers.length - 1].maxWorkingDays === null,
      "The last notice tier must cover all longer requests."
    );
    need(tiers.every((t) => isNonNegInt(t.noticeBusinessDays)), "Notice must be whole business days.");
    const cutoff = p.leave.notice.submissionCutoffMin;
    need(cutoff === null || isNonNegInt(cutoff) && cutoff < 1440, "Submission cutoff must be a time of day.");
    need(
      p.earlyLeave.perMonth >= 0 && p.earlyLeave.maxMinutes > 0 && p.earlyLeave.perWeek >= 0,
      "Early-leave limits must be positive."
    );
    need(p.wfh.perWeek >= 0 && isNonNegInt(p.wfh.tenureMonths), "WFH limits must be positive.");
    need(p.dayInLieu.expiryDays > 0, "Day-in-lieu expiry must be positive.");
    need(
      p.auth.codeTtlMin > 0 && p.auth.codeMaxAttempts > 0 && p.auth.codesPer15Min > 0,
      "Login code limits must be positive."
    );
    need(p.auth.sessionHours > 0 && p.auth.rememberDays > 0, "Session lengths must be positive.");
    return errors;
  }

  // src/services/policy.ts
  function policyOn(deps2, date2) {
    const rows = deps2.store.all("policy_versions").filter((v) => v.effectiveFrom <= date2).sort((a, b) => b.version - a.version);
    const row = rows[0];
    if (!row) return { version: 0, config: DEFAULT_POLICY };
    const config = JSON.parse(row.settings);
    const problems = validatePolicy(config);
    if (problems.length) throw new Error(`Policy version ${row.version} is invalid: ${problems.join(" ")}`);
    return { version: row.version, config };
  }
  function currentPolicy(deps2) {
    return policyOn(deps2, deps2.zone.localDate(deps2.clock.now())).config;
  }

  // src/api/router.ts
  // src/services/documents.ts
  var DOC_MAX_BYTES = 10 * 1024 * 1024;
  var DOC_CATEGORIES = ["CONTRACT", "ID", "CERTIFICATE", "CV", "MEDICAL", "OTHER"];
  var DOC_MIME = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  };
  function docsFolder(deps2) {
    const id = deps2.settings.get("DOCS_FOLDER_ID");
    if (id) {
      try {
        return DriveApp.getFolderById(id);
      } catch (e) {
      }
    }
    const folder = DriveApp.createFolder("iSkala HR Documents");
    deps2.settings.set("DOCS_FOLDER_ID", folder.getId());
    return folder;
  }
  function canReadDocs(ctx, e) {
    return e.id === ctx.principal.employeeId || can(ctx.principal, "employee.read.any");
  }
  function activeDocs(ctx) {
    return ctx.deps.store.all("employee_documents").filter((d) => !d.deletedAt);
  }
  function listDocuments(ctx, employeeId) {
    const e = requireEmployee(ctx, employeeId);
    if (!canReadDocs(ctx, e)) throw forbidden();
    return activeDocs(ctx).filter((d) => d.employeeId === e.id).sort((a, b) => a.createdAt < b.createdAt ? 1 : -1).map(({ driveFileId, ...rest }) => rest);
  }
  function uploadDocument(ctx, input) {
    authorize(ctx.principal, "employee.write");
    const e = requireEmployee(ctx, input.employeeId);
    const fileName = str(input.fileName, "File name", { max: 150 }).replace(/[\\/:*?"<>|]/g, "_");
    const ext = (fileName.split(".").pop() || "").toLowerCase();
    const mimeType = DOC_MIME[ext];
    if (!mimeType) throw invalid("Only PDF, image (JPG, PNG, WEBP, HEIC), Word or Excel files are allowed.");
    const category = oneOf(input.category || "OTHER", DOC_CATEGORIES, "Document type");
    if (typeof input.data !== "string" || !input.data) throw invalid("The file is empty.");
    let bytes;
    try {
      bytes = Utilities.base64Decode(input.data);
    } catch (err) {
      throw invalid("The file could not be read. Please try again.");
    }
    if (!bytes.length) throw invalid("The file is empty.");
    if (bytes.length > DOC_MAX_BYTES) throw invalid("Files must be 10 MB or smaller.");
    const { deps: deps2 } = ctx;
    const file = docsFolder(deps2).createFile(Utilities.newBlob(bytes, mimeType, `${e.employeeCode} - ${fileName}`));
    try {
      return deps2.lock.run(() => {
        const row = deps2.store.insert("employee_documents", {
          id: deps2.crypto.uuid(),
          employeeId: e.id,
          fileName,
          category,
          mimeType,
          sizeBytes: bytes.length,
          driveFileId: file.getId(),
          uploadedById: ctx.principal.userId,
          createdAt: nowIso(deps2),
          deletedAt: null,
          deletedById: null,
          deleteReason: null
        });
        audit(ctx, { action: "DOCUMENT.UPLOAD", entityType: "employee", entityId: e.id, after: { id: row.id, fileName, category } });
        const { driveFileId, ...rest } = row;
        return rest;
      });
    } catch (err) {
      file.setTrashed(true);
      throw err;
    }
  }
  function downloadDocument(ctx, id) {
    const d = activeDocs(ctx).find((x) => x.id === id);
    if (!d) throw notFound("Document");
    const e = requireEmployee(ctx, d.employeeId);
    if (!canReadDocs(ctx, e)) throw forbidden();
    const blob = DriveApp.getFileById(d.driveFileId).getBlob();
    return { fileName: d.fileName, mimeType: d.mimeType, data: Utilities.base64Encode(blob.getBytes()) };
  }
  function removeDocument(ctx, input) {
    authorize(ctx.principal, "employee.write");
    const why = reason(input.reason);
    const { deps: deps2 } = ctx;
    const removed = deps2.lock.run(() => {
      const before = activeDocs(ctx).find((x) => x.id === input.id);
      if (!before) throw notFound("Document");
      const after = deps2.store.update("employee_documents", before.id, { deletedAt: nowIso(deps2), deletedById: ctx.principal.userId, deleteReason: why });
      audit(ctx, { action: "DOCUMENT.REMOVE", entityType: "employee", entityId: before.employeeId, before: { id: before.id, fileName: before.fileName }, reason: why });
      return after;
    });
    try {
      DriveApp.getFileById(removed.driveFileId).setTrashed(true);
    } catch (err) {
      console.error(err);
    }
    return null;
  }


  // src/services/leave.ts
  var LEAVE_TYPES = ["ANNUAL", "CASUAL", "SICK", "PATERNITY", "BEREAVEMENT", "MATERNITY"];
  var LEAVE_LABELS = {
    ANNUAL: "Annual leave",
    CASUAL: "Casual / emergency leave",
    SICK: "Sick leave",
    PATERNITY: "Paternity leave",
    BEREAVEMENT: "Bereavement leave",
    MATERNITY: "Maternity leave"
  };
  var LEAVE_CALENDAR_TYPES = ["MATERNITY"];
  var LEAVE_TENURE_TYPES = ["ANNUAL", "CASUAL"];
  var LEAVE_BACKDATE_DAYS = { CASUAL: 3, SICK: 7, BEREAVEMENT: 7, MATERNITY: 30, PATERNITY: 30, ANNUAL: 0 };
  var LEAVE_OPEN = ["PENDING", "APPROVED"];
  var LEAVE_GENDER = { MATERNITY: "FEMALE", PATERNITY: "MALE" };
  function leaveTypesFor(emp) {
    return LEAVE_TYPES.filter((t) => !LEAVE_GENDER[t] || LEAVE_GENDER[t] === emp.gender);
  }
  function leaveEntitlement(cfg, type) {
    const l = cfg.leave;
    if (type === "ANNUAL") return l.regularDays;
    if (type === "CASUAL") return l.casualDays;
    if (type === "SICK") return l.sick.paidDays;
    if (type === "PATERNITY") return l.paternity.days;
    if (type === "BEREAVEMENT") return l.bereavement.days;
    if (type === "MATERNITY") return l.maternity.days;
    return 0;
  }
  function addMonths(date2, months) {
    const t = toUtc(date2);
    const d = t.getUTCDate();
    t.setUTCDate(1);
    t.setUTCMonth(t.getUTCMonth() + months);
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    t.setUTCDate(Math.min(d, last));
    return fromUtc(t);
  }
  function holidaySet(ctx) {
    return new Set(ctx.deps.store.all("public_holidays").filter((h) => !h.deletedAt).map((h) => h.date));
  }
  function workDaySet(ctx, employeeId) {
    var _a;
    const open = ctx.deps.store.all("employee_schedule_assignments").find((r) => r.employeeId === employeeId && !r.effectiveTo);
    const all = listSchedules(ctx);
    const sched = (_a = open && all.find((s) => s.id === open.scheduleId)) != null ? _a : all.find((s) => s.isDefault);
    const days = sched && Array.isArray(sched.workDays) ? sched.workDays : [0, 1, 2, 3, 4];
    return new Set(days.map(Number));
  }
  function eachDate(start, end, fn) {
    let d = start;
    for (let i = 0; i <= 500; i++) {
      if (d > end) return;
      fn(d);
      d = addDays(d, 1);
    }
    throw invalid("That leave period is too long.");
  }
  function countLeaveDays(ctx, employeeId, type, start, end) {
    if (end < start) throw invalid("The end date cannot be before the start date.");
    let n = 0;
    if (LEAVE_CALENDAR_TYPES.indexOf(type) >= 0) {
      eachDate(start, end, () => {
        n++;
      });
      return n;
    }
    const work = workDaySet(ctx, employeeId);
    const hol = holidaySet(ctx);
    eachDate(start, end, (d) => {
      if (work.has(toUtc(d).getUTCDay()) && !hol.has(d)) n++;
    });
    return n;
  }
  function noticeDaysGiven(ctx, employeeId, submittedOn, start) {
    if (start <= submittedOn) return 0;
    const work = workDaySet(ctx, employeeId);
    const hol = holidaySet(ctx);
    let n = 0;
    eachDate(addDays(submittedOn, 1), start, (d) => {
      if (work.has(toUtc(d).getUTCDay()) && !hol.has(d)) n++;
    });
    return n;
  }
  function noticeRequired(cfg, workingDays) {
    var _a, _b;
    const tiers = (_b = (_a = cfg.leave.notice) == null ? void 0 : _a.tiers) != null ? _b : [];
    for (const t of tiers) {
      if (t.maxWorkingDays === null || t.maxWorkingDays === void 0) return t.noticeBusinessDays;
      if (workingDays < t.maxWorkingDays) return t.noticeBusinessDays;
    }
    return 0;
  }
  var leaveRows = (ctx) => ctx.deps.store.all("leave_requests");
  function sumDays(rows, employeeId, type, year, statuses) {
    return rows.filter((r) => r.employeeId === employeeId && r.type === type && yearOf(r.startDate) === year && statuses.indexOf(r.status) >= 0).reduce((s, r) => s + Number(r.days || 0), 0);
  }
  function sumAdjustments(ctx, employeeId, type, year) {
    return ctx.deps.store.all("leave_adjustments").filter((a) => a.employeeId === employeeId && a.type === type && Number(a.year) === year).reduce((s, a) => s + Number(a.days || 0), 0);
  }
  function leaveBalance(ctx, emp, cfg, type, year, rows, depth) {
    const base = leaveEntitlement(cfg, type);
    let carried = 0;
    if (type === "ANNUAL") {
      const cap = cfg.leave.carryoverMaxRegular;
      const prev = year - 1;
      if (cap > 0 && (depth || 0) < 15 && prev > yearOf(emp.hireDate)) {
        const before = leaveBalance(ctx, emp, cfg, "ANNUAL", prev, rows, (depth || 0) + 1);
        carried = Math.max(0, Math.min(cap, before.remaining));
      }
    }
    const adjusted = sumAdjustments(ctx, emp.id, type, year);
    const taken = sumDays(rows, emp.id, type, year, ["APPROVED"]);
    const pending = sumDays(rows, emp.id, type, year, ["PENDING"]);
    const entitled = base + carried + adjusted;
    return {
      type,
      label: LEAVE_LABELS[type],
      year,
      base,
      carried,
      adjusted,
      entitled,
      taken,
      pending,
      remaining: entitled - taken,
      available: entitled - taken - pending
    };
  }
  function leaveBalances(ctx, emp, year) {
    const cfg = policyOn(ctx.deps, today(ctx.deps)).config;
    const rows = leaveRows(ctx);
    return leaveTypesFor(emp).map((t) => leaveBalance(ctx, emp, cfg, t, year, rows, 0));
  }
  function canApproveLeave(ctx, emp) {
    const p = ctx.principal;
    if (emp.id === p.employeeId) return can(p, "leave.approve.any");
    if (can(p, "leave.approve.any")) return true;
    return p.employeeId !== null && emp.managerId === p.employeeId;
  }
  function shapeLeave(ctx, r, byId) {
    var _a, _b, _c, _d;
    const emp = byId.get(r.employeeId);
    return {
      id: r.id,
      employeeId: r.employeeId,
      employeeName: (_a = emp && emp.fullName) != null ? _a : "Unknown",
      employeeCode: (_b = emp && emp.employeeCode) != null ? _b : "",
      type: r.type,
      typeLabel: (_c = LEAVE_LABELS[r.type]) != null ? _c : r.type,
      startDate: r.startDate,
      endDate: r.endDate,
      days: Number(r.days || 0),
      reason: r.reason,
      status: r.status,
      decisionNote: r.decisionNote,
      decidedAt: r.decidedAt,
      decidedByName: (_d = (r.decidedById && (() => {
        const u = ctx.deps.store.all("users").find((x) => x.id === r.decidedById);
        const e2 = u && byId.get(u.employeeId);
        return e2 ? e2.fullName : null;
      })())) != null ? _d : null,
      createdAt: r.createdAt,
      canDecide: r.status === "PENDING" && emp ? canApproveLeave(ctx, emp) : false,
      canCancel: r.status === "PENDING" || r.status === "APPROVED" ? r.employeeId === ctx.principal.employeeId || can(ctx.principal, "leave.manage") : false
    };
  }
  function employeeIndex(ctx) {
    return new Map(ctx.deps.store.all("employees").map((e2) => [e2.id, e2]));
  }
  function leaveSummary(ctx, input) {
    var _a, _b;
    const id = (_a = input.employeeId) != null ? _a : ctx.principal.employeeId;
    if (!id) throw invalid("Your account is not linked to an employee record. Contact HR.");
    const emp = requireEmployee(ctx, id);
    if (!canReadEmployee(ctx.principal, emp)) throw forbidden();
    const cfg = policyOn(ctx.deps, today(ctx.deps)).config;
    const year = Number((_b = input.year) != null ? _b : yearOf(today(ctx.deps)));
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw invalid("Choose a valid year.");
    const byId = employeeIndex(ctx);
    const requests = leaveRows(ctx).filter((r) => r.employeeId === id && yearOf(r.startDate) === year).sort((a, b) => a.startDate < b.startDate ? 1 : -1).map((r) => shapeLeave(ctx, r, byId));
    return {
      employee: { id: emp.id, fullName: emp.fullName, employeeCode: emp.employeeCode, hireDate: emp.hireDate, employmentStatus: emp.employmentStatus },
      year,
      eligibleFrom: addMonths(emp.hireDate, cfg.leave.tenureMonths),
      carryoverCap: cfg.leave.carryoverMaxRegular,
      canRequest: emp.id === ctx.principal.employeeId || can(ctx.principal, "leave.manage"),
      canAdjust: can(ctx.principal, "leave.manage"),
      balances: leaveBalances(ctx, emp, year),
      permissions: permissionSummary(ctx, emp, year),
      wfh: wfhSummary(ctx, emp, year),
      calendar: { workDays: [...workDaySet(ctx, emp.id)], holidays: [...holidaySet(ctx)], calendarTypes: LEAVE_CALENDAR_TYPES },
      requests
    };
  }
  function tellEmployee(ctx, emp, slackText, subject, emailText) {
    if (!emp || !emp.email) return;
    try {
      if (slackDm(ctx.deps, emp.email, slackText)) return;
    } catch (err) {
      console.error(err);
    }
    notifyLeave(ctx, emp.email, subject, emailText);
  }
  function notifyLeave(ctx, to, subject, text) {
    if (!to) return;
    try {
      if (ctx.deps.mailer.remainingQuota() < 1) return;
      ctx.deps.mailer.send({ to, subject, text });
    } catch (err) {
      console.error(err);
    }
  }
  function submitLeave(ctx, input) {
    var _a, _b;
    const { deps: deps2 } = ctx;
    const employeeId = (_a = input.employeeId) != null ? _a : ctx.principal.employeeId;
    if (!employeeId) throw invalid("Your account is not linked to an employee record. Contact HR.");
    if (employeeId !== ctx.principal.employeeId && !can(ctx.principal, "leave.manage")) throw forbidden();
    const type = oneOf(input.type, LEAVE_TYPES, "Leave type");
    const startDate = date(input.startDate, "Start date");
    const endDate = date(input.endDate, "End date");
    const why = str(input.reason, "Reason", { max: 300, optional: true });
    return deps2.lock.run(() => {
      const emp = requireEmployee(ctx, employeeId);
      if (emp.employmentStatus === "TERMINATED") throw invalid("This employee has left the company.");
      if (LEAVE_GENDER[type] && !emp.gender) throw invalid(`${LEAVE_LABELS[type]} needs the employee's gender to be set. Ask HR to add it to the profile.`);
      if (leaveTypesFor(emp).indexOf(type) < 0) throw invalid(`${LEAVE_LABELS[type]} does not apply to this employee.`);
      const cfg = policyOn(deps2, today(deps2)).config;
      const now = today(deps2);
      if (yearOf(startDate) !== yearOf(endDate)) throw invalid("A leave request must start and end in the same year. Split it into two requests.");
      if (LEAVE_TENURE_TYPES.indexOf(type) >= 0) {
        const from = addMonths(emp.hireDate, cfg.leave.tenureMonths);
        if (startDate < from) throw invalid(`Leave eligibility starts on ${from}, after ${cfg.leave.tenureMonths} months of service.`);
      }
      if (startDate < emp.hireDate) throw invalid("Leave cannot start before the hire date.");
      const backdate = (_b = LEAVE_BACKDATE_DAYS[type]) != null ? _b : 0;
      if (startDate < addDays(now, -backdate)) {
        throw invalid(backdate === 0 ? "This leave type must be requested before it starts." : `This leave type can be reported up to ${backdate} days late.`);
      }
      const days = countLeaveDays(ctx, employeeId, type, startDate, endDate);
      if (days <= 0) throw invalid("Those dates contain no working days. Check the dates, weekends and public holidays.");
      const overlap = leaveRows(ctx).find((r) => r.employeeId === employeeId && LEAVE_OPEN.indexOf(r.status) >= 0 && r.startDate <= endDate && r.endDate >= startDate);
      if (overlap) throw conflict(`These dates overlap a ${overlap.status.toLowerCase()} request from ${overlap.startDate} to ${overlap.endDate}.`);
      const rows = leaveRows(ctx);
      const bal = leaveBalance(ctx, emp, cfg, type, yearOf(startDate), rows, 0);
      if (days > bal.available) {
        throw invalid(`Not enough balance. ${LEAVE_LABELS[type]} has ${bal.available} day${bal.available === 1 ? "" : "s"} left for ${yearOf(startDate)} and you asked for ${days}.`);
      }
      const at = nowIso(deps2);
      const auto = type === "CASUAL" && cfg.leave.casualAutoApprove === true;
      const row = deps2.store.insert("leave_requests", {
        id: deps2.crypto.uuid(),
        employeeId,
        type,
        startDate,
        endDate,
        days,
        reason: why,
        status: auto ? "APPROVED" : "PENDING",
        requestedById: ctx.principal.userId,
        createdAt: at,
        decidedById: auto ? ctx.principal.userId : null,
        decidedAt: auto ? at : null,
        decisionNote: auto ? "Auto-approved by policy" : null,
        cancelledAt: null,
        cancelledById: null,
        cancelReason: null,
        updatedAt: at
      });
      audit(ctx, { action: "LEAVE.REQUEST", entityType: "leave_request", entityId: row.id, after: row, reason: why });
      if (!auto) {
        const mgr = emp.managerId ? ctx.deps.store.all("employees").find((e2) => e2.id === emp.managerId) : null;
        notifyLeave(
          ctx,
          mgr ? mgr.email : deps2.settings.get("HR_REPLY_TO"),
          `Leave request from ${emp.fullName}`,
          `${emp.fullName} requested ${LEAVE_LABELS[type]} from ${startDate} to ${endDate} (${days} day${days === 1 ? "" : "s"}).

Reason: ${why || "-"}

Open iSkala HR to approve or reject it.`
        );
      }
      return shapeLeave(ctx, row, employeeIndex(ctx));
    });
  }
  function decideLeave(ctx, input) {
    const { deps: deps2 } = ctx;
    const id = str(input.id, "Request", { max: 60 });
    const decision = oneOf(input.decision, ["APPROVED", "REJECTED"], "Decision");
    const note = str(input.note, "Note", { max: 300, optional: decision === "APPROVED" });
    return deps2.lock.run(() => {
      const row = leaveRows(ctx).find((r) => r.id === id);
      if (!row) throw notFound("Leave request");
      if (row.status !== "PENDING") throw conflict("This request has already been decided.");
      const emp = requireEmployee(ctx, row.employeeId);
      if (!canApproveLeave(ctx, emp)) throw forbidden("Only this employee's manager or HR can decide this request.");
      if (decision === "APPROVED") {
        const cfg = policyOn(deps2, today(deps2)).config;
        const bal = leaveBalance(ctx, emp, cfg, row.type, yearOf(row.startDate), leaveRows(ctx), 0);
        if (Number(row.days) > bal.remaining) {
          throw invalid(`Not enough balance left to approve this. ${LEAVE_LABELS[row.type]} has ${bal.remaining} day${bal.remaining === 1 ? "" : "s"} remaining.`);
        }
      }
      const at = nowIso(deps2);
      const next = deps2.store.update("leave_requests", id, {
        status: decision,
        decidedById: ctx.principal.userId,
        decidedAt: at,
        decisionNote: note,
        updatedAt: at
      });
      audit(ctx, { action: `LEAVE.${decision}`, capacity: "MANAGER", entityType: "leave_request", entityId: id, before: row, after: next, reason: note });
      notifyLeave(
        ctx,
        emp.email,
        `Your leave request was ${decision === "APPROVED" ? "approved" : "rejected"}`,
        `Your ${LEAVE_LABELS[row.type]} from ${row.startDate} to ${row.endDate} (${row.days} day${Number(row.days) === 1 ? "" : "s"}) was ${decision === "APPROVED" ? "approved" : "rejected"}.

${note ? `Note: ${note}` : ""}`
      );
      return shapeLeave(ctx, next, employeeIndex(ctx));
    });
  }
  function cancelLeave(ctx, input) {
    const { deps: deps2 } = ctx;
    const id = str(input.id, "Request", { max: 60 });
    const why = reason(input.reason);
    return deps2.lock.run(() => {
      const row = leaveRows(ctx).find((r) => r.id === id);
      if (!row) throw notFound("Leave request");
      if (row.status === "CANCELLED" || row.status === "REJECTED") throw conflict("This request is already closed.");
      const mine = row.employeeId === ctx.principal.employeeId;
      const hr = can(ctx.principal, "leave.manage");
      if (!mine && !hr) throw forbidden();
      if (mine && !hr && row.status === "APPROVED" && row.startDate <= today(deps2)) {
        throw invalid("Approved leave that has already started can only be cancelled by HR.");
      }
      const at = nowIso(deps2);
      const next = deps2.store.update("leave_requests", id, {
        status: "CANCELLED",
        cancelledAt: at,
        cancelledById: ctx.principal.userId,
        cancelReason: why,
        updatedAt: at
      });
      audit(ctx, { action: "LEAVE.CANCEL", capacity: hr && !mine ? "HR" : "SELF", entityType: "leave_request", entityId: id, before: row, after: next, reason: why });
      return shapeLeave(ctx, next, employeeIndex(ctx));
    });
  }
  function pendingLeave(ctx) {
    const byId = employeeIndex(ctx);
    return leaveRows(ctx).filter((r) => {
      if (r.status !== "PENDING") return false;
      const emp = byId.get(r.employeeId);
      return !!emp && !emp.deletedAt && canApproveLeave(ctx, emp);
    }).sort((a, b) => a.startDate > b.startDate ? 1 : -1).map((r) => shapeLeave(ctx, r, byId));
  }
  function adjustLeave(ctx, input) {
    const { deps: deps2 } = ctx;
    authorize(ctx.principal, "leave.manage");
    const employeeId = str(input.employeeId, "Employee", { max: 60 });
    const type = oneOf(input.type, LEAVE_TYPES, "Leave type");
    
    const year = Number(input.year);
    const days = Number(input.days);
    const why = reason(input.reason);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw invalid("Choose a valid year.");
    if (!Number.isFinite(days) || days === 0 || Math.abs(days) > 400) throw invalid("Enter the days to add or remove, for example 2 or -2.");
    if (Math.round(days * 2) !== days * 2) throw invalid("Use whole days or halves, for example 1 or 1.5.");
    return deps2.lock.run(() => {
      const emp = requireEmployee(ctx, employeeId);
      if (leaveTypesFor(emp).indexOf(type) < 0) throw invalid(`${LEAVE_LABELS[type]} does not apply to this employee.`);
      const at = nowIso(deps2);
      const row = deps2.store.insert("leave_adjustments", {
        id: deps2.crypto.uuid(),
        employeeId,
        year,
        type,
        days,
        reason: why,
        createdById: ctx.principal.userId,
        createdAt: at
      });
      audit(ctx, { action: "LEAVE.ADJUST", capacity: "HR", entityType: "employee", entityId: emp.id, after: row, reason: why });
      return leaveBalances(ctx, emp, year);
    });
  }
  function leaveOverview(ctx, input) {
    var _a;
    authorize(ctx.principal, "leave.read.any");
    const year = Number((_a = input.year) != null ? _a : yearOf(today(ctx.deps)));
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw invalid("Choose a valid year.");
    return activeEmployees(ctx).filter((e2) => e2.employmentStatus !== "TERMINATED").sort((a, b) => a.fullName.localeCompare(b.fullName)).map((e2) => ({
      id: e2.id,
      employeeCode: e2.employeeCode,
      fullName: e2.fullName,
      balances: leaveBalances(ctx, e2, year)
    }));
  }


  // src/services/permissions.ts
  var PERM_OPEN = ["PENDING", "APPROVED"];
  var PERM_BACKDATE_DAYS = 2;
  var HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  var monthOf = (d) => d.slice(0, 7);
  var weekStartOf = (d) => addDays(d, -toUtc(d).getUTCDay());

  // src/services/wfh.ts
  var WFH_OPEN = ["PENDING", "APPROVED"];
  var WFH_HR_BACKDATE_DAYS = 30;
  var wfhRows = (ctx) => ctx.deps.store.all("wfh_requests");
  function wfhPolicy(cfg) {
    const w = cfg.wfh || DEFAULT_POLICY.wfh;
    return {
      perWeek: Number(w.perWeek),
      tenureMonths: Number(w.tenureMonths),
      blockBridge: w.blockThursdaySundayBridge !== false
    };
  }
  function isWorkingDay(work, hol, d) {
    return work.has(toUtc(d).getUTCDay()) && !hol.has(d);
  }
  function workDayAcrossBreak(work, hol, d, dir) {
    let cur = d;
    let skipped = 0;
    for (let i = 0; i < 21; i++) {
      cur = addDays(cur, dir);
      if (isWorkingDay(work, hol, cur)) return { day: cur, skipped };
      skipped++;
    }
    return null;
  }
  function wfhUsed(rows, employeeId, weekStart) {
    return rows.filter((r) => r.employeeId === employeeId && WFH_OPEN.indexOf(r.status) >= 0 && weekStartOf(r.date) === weekStart).length;
  }
  function shapeWfh(ctx, r, byId) {
    var _a, _b;
    const emp = byId.get(r.employeeId);
    return {
      id: r.id,
      employeeId: r.employeeId,
      employeeName: (_a = emp && emp.fullName) != null ? _a : "Unknown",
      employeeCode: (_b = emp && emp.employeeCode) != null ? _b : "",
      date: r.date,
      reason: r.reason,
      status: r.status,
      source: r.source || "WEB",
      decisionNote: r.decisionNote,
      decidedAt: r.decidedAt,
      createdAt: r.createdAt,
      canDecide: r.status === "PENDING" && emp ? canApproveLeave(ctx, emp) : false,
      canCancel: WFH_OPEN.indexOf(r.status) >= 0 ? r.employeeId === ctx.principal.employeeId || can(ctx.principal, "leave.manage") : false
    };
  }
  function wfhSummary(ctx, emp, year) {
    const cfg = policyOn(ctx.deps, today(ctx.deps)).config;
    const pol = wfhPolicy(cfg);
    const now = today(ctx.deps);
    const week = weekStartOf(now);
    const rows = wfhRows(ctx);
    const weekUsed = wfhUsed(rows, emp.id, week);
    const byId = employeeIndex(ctx);
    return {
      limits: { perWeek: pol.perWeek, tenureMonths: pol.tenureMonths, blockBridge: pol.blockBridge },
      eligibleFrom: addMonths(emp.hireDate, pol.tenureMonths),
      weekStart: week,
      weekEnd: addDays(week, 6),
      weekUsed,
      weekRemaining: Math.max(0, pol.perWeek - weekUsed),
      rows: rows.filter((r) => r.employeeId === emp.id && yearOf(r.date) === year).sort((a, b) => a.date < b.date ? 1 : -1).map((r) => shapeWfh(ctx, r, byId))
    };
  }
  function submitWfh(ctx, input) {
    var _a;
    const { deps: deps2 } = ctx;
    const employeeId = (_a = input.employeeId) != null ? _a : ctx.principal.employeeId;
    if (!employeeId) throw invalid("Your account is not linked to an employee record. Contact HR.");
    const hr = can(ctx.principal, "leave.manage");
    if (employeeId !== ctx.principal.employeeId && !hr) throw forbidden();
    const day = date(input.date, "Date");
    const why = str(input.reason, "Reason", { max: 300, optional: true });
    return deps2.lock.run(() => {
      const emp = requireEmployee(ctx, employeeId);
      if (emp.employmentStatus === "TERMINATED") throw invalid("This employee has left the company.");
      const cfg = policyOn(deps2, today(deps2)).config;
      const pol = wfhPolicy(cfg);
      const now = today(deps2);
      if (pol.perWeek <= 0) throw invalid("Working from home is not available under the current policy.");
      const from = addMonths(emp.hireDate, pol.tenureMonths);
      if (day < from) throw invalid(`Working from home is available from ${from}, after ${pol.tenureMonths} months of service.`);
      if (day < now) {
        if (!hr) throw invalid("Working from home must be requested on or before the day.");
        if (day < addDays(now, -WFH_HR_BACKDATE_DAYS)) throw invalid(`HR can record past WFH days up to ${WFH_HR_BACKDATE_DAYS} days back.`);
      }
      const work = workDaySet(ctx, employeeId);
      const hol = holidaySet(ctx);
      if (!isWorkingDay(work, hol, day)) throw invalid("That date is not a working day for this employee.");
      const rows = wfhRows(ctx);
      const mine = rows.filter((r) => r.employeeId === employeeId && WFH_OPEN.indexOf(r.status) >= 0);
      if (mine.some((r) => r.date === day)) throw conflict("There is already a WFH request for that day.");
      const leave = leaveRows(ctx).find((r) => r.employeeId === employeeId && LEAVE_OPEN.indexOf(r.status) >= 0 && r.startDate <= day && r.endDate >= day);
      if (leave) throw conflict(`That day is covered by a ${leave.status.toLowerCase()} leave request (${leave.startDate} to ${leave.endDate}).`);
      const used = wfhUsed(rows, employeeId, weekStartOf(day));
      if (used >= pol.perWeek) {
        throw invalid(`That week already has ${used} WFH day${used === 1 ? "" : "s"}. The limit is ${pol.perWeek} per week.`);
      }
      if (pol.blockBridge) {
        for (const dir of [-1, 1]) {
          const other = workDayAcrossBreak(work, hol, day, dir);
          if (other && other.skipped > 0 && mine.some((r) => r.date === other.day)) {
            throw invalid(`You already have WFH on ${other.day}. WFH cannot be on the working days on both sides of a weekend or holiday.`);
          }
        }
      }
      const at = nowIso(deps2);
      const row = deps2.store.insert("wfh_requests", {
        id: deps2.crypto.uuid(),
        employeeId,
        date: day,
        reason: why,
        status: "PENDING",
        requestedById: ctx.principal.userId,
        createdAt: at,
        decidedById: null,
        decidedAt: null,
        decisionNote: null,
        cancelledAt: null,
        cancelledById: null,
        cancelReason: null,
        source: input.source === "SLACK" ? "SLACK" : "WEB",
        updatedAt: at
      });
      audit(ctx, { action: "WFH.REQUEST", entityType: "wfh_request", entityId: row.id, after: row, reason: why });
      const mgr = emp.managerId ? deps2.store.all("employees").find((e2) => e2.id === emp.managerId) : null;
      notifyLeave(
        ctx,
        mgr ? mgr.email : deps2.settings.get("HR_REPLY_TO"),
        `WFH request from ${emp.fullName}`,
        `${emp.fullName} asked to work from home on ${day}.

Reason: ${why || "-"}

Open iSkala HR to approve or reject it.`
      );
      return shapeWfh(ctx, row, employeeIndex(ctx));
    });
  }
  function decideWfh(ctx, input) {
    const { deps: deps2 } = ctx;
    const id = str(input.id, "WFH request", { max: 60 });
    const decision = oneOf(input.decision, ["APPROVED", "REJECTED"], "Decision");
    const note = str(input.note, "Note", { max: 300, optional: decision === "APPROVED" });
    return deps2.lock.run(() => {
      const row = wfhRows(ctx).find((r) => r.id === id);
      if (!row) throw notFound("WFH request");
      if (row.status !== "PENDING") throw conflict("This WFH request has already been decided.");
      const emp = requireEmployee(ctx, row.employeeId);
      if (!canApproveLeave(ctx, emp)) throw forbidden("Only this employee's manager or HR can decide this request.");
      const at = nowIso(deps2);
      const next = deps2.store.update("wfh_requests", id, {
        status: decision,
        decidedById: ctx.principal.userId,
        decidedAt: at,
        decisionNote: note,
        updatedAt: at
      });
      audit(ctx, { action: `WFH.${decision}`, capacity: "MANAGER", entityType: "wfh_request", entityId: id, before: row, after: next, reason: note });
      const word = decision === "APPROVED" ? "approved" : "rejected";
      if (ctx.principal.userAgent !== "slack") {
        tellEmployee(
          ctx,
          emp,
          `${decision === "APPROVED" ? ":white_check_mark:" : ":no_entry:"} Your request to work from home on *${row.date}* was ${word}.${note ? `\n> ${note}` : ""}`,
          `Your WFH request was ${word}`,
          `Your request to work from home on ${row.date} was ${word}.

${note ? `Note: ${note}` : ""}`
        );
      }
      return shapeWfh(ctx, next, employeeIndex(ctx));
    });
  }
  function cancelWfh(ctx, input) {
    const { deps: deps2 } = ctx;
    const id = str(input.id, "WFH request", { max: 60 });
    const why = reason(input.reason);
    return deps2.lock.run(() => {
      const row = wfhRows(ctx).find((r) => r.id === id);
      if (!row) throw notFound("WFH request");
      if (WFH_OPEN.indexOf(row.status) < 0) throw conflict("This WFH request is already closed.");
      const mine = row.employeeId === ctx.principal.employeeId;
      const hr = can(ctx.principal, "leave.manage");
      if (!mine && !hr) throw forbidden();
      if (mine && !hr && row.status === "APPROVED" && row.date < today(deps2)) {
        throw invalid("A WFH day that has already passed can only be cancelled by HR.");
      }
      const at = nowIso(deps2);
      const next = deps2.store.update("wfh_requests", id, {
        status: "CANCELLED",
        cancelledAt: at,
        cancelledById: ctx.principal.userId,
        cancelReason: why,
        updatedAt: at
      });
      audit(ctx, { action: "WFH.CANCEL", capacity: hr && !mine ? "HR" : "SELF", entityType: "wfh_request", entityId: id, before: row, after: next, reason: why });
      if (!mine) {
        const target = deps2.store.all("employees").find((e2) => e2.id === row.employeeId);
        tellEmployee(
          ctx,
          target,
          `:x: Your work-from-home day on *${row.date}* was cancelled by HR.\n> ${why}\nThe day has gone back into your weekly allowance.`,
          `Your WFH day on ${row.date} was cancelled`,
          `Your work-from-home day on ${row.date} was cancelled by HR.\n\nReason: ${why}\n\nThe day has gone back into your weekly allowance. Open iSkala HR if you want to request another day.`
        );
      }
      return shapeWfh(ctx, next, employeeIndex(ctx));
    });
  }
  function pendingWfh(ctx) {
    const byId = employeeIndex(ctx);
    return wfhRows(ctx).filter((r) => {
      if (r.status !== "PENDING") return false;
      const emp = byId.get(r.employeeId);
      return !!emp && !emp.deletedAt && canApproveLeave(ctx, emp);
    }).sort((a, b) => a.date > b.date ? 1 : -1).map((r) => shapeWfh(ctx, r, byId));
  }

  var permRows = (ctx) => ctx.deps.store.all("permissions");
  function permLimits(cfg) {
    const el = cfg.earlyLeave;
    return { maxPerRequest: el.maxMinutes, weekly: el.perWeek * el.maxMinutes, monthly: el.perMonth * el.maxMinutes };
  }
  function permUsed(rows, employeeId, match) {
    return rows.filter((r) => r.employeeId === employeeId && PERM_OPEN.indexOf(r.status) >= 0 && match(r)).reduce((s, r) => s + Number(r.minutes || 0), 0);
  }
  function shapePerm(ctx, r, byId) {
    var _a, _b;
    const emp = byId.get(r.employeeId);
    return {
      id: r.id,
      employeeId: r.employeeId,
      employeeName: (_a = emp && emp.fullName) != null ? _a : "Unknown",
      employeeCode: (_b = emp && emp.employeeCode) != null ? _b : "",
      date: r.date,
      minutes: Number(r.minutes || 0),
      fromTime: r.fromTime,
      reason: r.reason,
      status: r.status,
      decisionNote: r.decisionNote,
      decidedAt: r.decidedAt,
      createdAt: r.createdAt,
      canDecide: r.status === "PENDING" && emp ? canApproveLeave(ctx, emp) : false,
      canCancel: PERM_OPEN.indexOf(r.status) >= 0 ? r.employeeId === ctx.principal.employeeId || can(ctx.principal, "leave.manage") : false
    };
  }
  function permissionSummary(ctx, emp, year) {
    const cfg = policyOn(ctx.deps, today(ctx.deps)).config;
    const limits = permLimits(cfg);
    const now = today(ctx.deps);
    const month = monthOf(now);
    const week = weekStartOf(now);
    const rows = permRows(ctx);
    const monthUsed = permUsed(rows, emp.id, (r) => monthOf(r.date) === month);
    const weekUsed = permUsed(rows, emp.id, (r) => weekStartOf(r.date) === week);
    const byId = employeeIndex(ctx);
    return {
      limits,
      month,
      monthUsed,
      monthRemaining: Math.max(0, limits.monthly - monthUsed),
      weekStart: week,
      weekEnd: addDays(week, 6),
      weekUsed,
      weekRemaining: Math.max(0, limits.weekly - weekUsed),
      rows: rows.filter((r) => r.employeeId === emp.id && yearOf(r.date) === year).sort((a, b) => a.date < b.date ? 1 : -1).map((r) => shapePerm(ctx, r, byId))
    };
  }
  function fmtMins(n) {
    const h = Math.floor(n / 60), m2 = n % 60;
    if (h && m2) return `${h}h ${m2}m`;
    if (h) return `${h}h`;
    return `${m2}m`;
  }
  function submitPermission(ctx, input) {
    var _a;
    const { deps: deps2 } = ctx;
    const employeeId = (_a = input.employeeId) != null ? _a : ctx.principal.employeeId;
    if (!employeeId) throw invalid("Your account is not linked to an employee record. Contact HR.");
    if (employeeId !== ctx.principal.employeeId && !can(ctx.principal, "leave.manage")) throw forbidden();
    const day = date(input.date, "Date");
    const minutes = Number(input.minutes);
    const fromTime = str(input.fromTime, "Leaving at", { max: 5, optional: true });
    const why = str(input.reason, "Reason", { max: 300, optional: true });
    if (fromTime && !HHMM.test(fromTime)) throw invalid("Leaving at must be a time like 15:30.");
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes % 15 !== 0) throw invalid("Choose a length in 15-minute steps.");
    return deps2.lock.run(() => {
      const emp = requireEmployee(ctx, employeeId);
      if (emp.employmentStatus === "TERMINATED") throw invalid("This employee has left the company.");
      const cfg = policyOn(deps2, today(deps2)).config;
      const limits = permLimits(cfg);
      const now = today(deps2);
      if (minutes > limits.maxPerRequest) throw invalid(`A single permission cannot be longer than ${fmtMins(limits.maxPerRequest)}.`);
      if (day < addDays(now, -PERM_BACKDATE_DAYS)) throw invalid(`A permission can be reported up to ${PERM_BACKDATE_DAYS} days late.`);
      if (day < emp.hireDate) throw invalid("The date cannot be before the hire date.");
      const work = workDaySet(ctx, employeeId);
      const hol = holidaySet(ctx);
      if (!work.has(toUtc(day).getUTCDay()) || hol.has(day)) throw invalid("That date is not a working day for this employee.");
      const rows = permRows(ctx);
      if (rows.some((r) => r.employeeId === employeeId && r.date === day && PERM_OPEN.indexOf(r.status) >= 0)) {
        throw conflict("There is already a permission for that day.");
      }
      const weekUsed = permUsed(rows, employeeId, (r) => weekStartOf(r.date) === weekStartOf(day));
      if (weekUsed + minutes > limits.weekly) {
        throw invalid(`That week already uses ${fmtMins(weekUsed)} of the ${fmtMins(limits.weekly)} weekly limit. You can still take ${fmtMins(Math.max(0, limits.weekly - weekUsed))}.`);
      }
      const monthUsed = permUsed(rows, employeeId, (r) => monthOf(r.date) === monthOf(day));
      if (monthUsed + minutes > limits.monthly) {
        throw invalid(`That month already uses ${fmtMins(monthUsed)} of the ${fmtMins(limits.monthly)} monthly limit. You can still take ${fmtMins(Math.max(0, limits.monthly - monthUsed))}.`);
      }
      const at = nowIso(deps2);
      const row = deps2.store.insert("permissions", {
        id: deps2.crypto.uuid(),
        employeeId,
        date: day,
        minutes,
        fromTime,
        reason: why,
        status: "PENDING",
        requestedById: ctx.principal.userId,
        createdAt: at,
        decidedById: null,
        decidedAt: null,
        decisionNote: null,
        cancelledAt: null,
        cancelledById: null,
        cancelReason: null,
        updatedAt: at
      });
      audit(ctx, { action: "PERMISSION.REQUEST", entityType: "permission", entityId: row.id, after: row, reason: why });
      const mgr = emp.managerId ? deps2.store.all("employees").find((e2) => e2.id === emp.managerId) : null;
      notifyLeave(
        ctx,
        mgr ? mgr.email : deps2.settings.get("HR_REPLY_TO"),
        `Early-leave permission from ${emp.fullName}`,
        `${emp.fullName} asked to leave ${fmtMins(minutes)} early on ${day}${fromTime ? ` (from ${fromTime})` : ""}.

Reason: ${why || "-"}

Open iSkala HR to approve or reject it.`
      );
      return shapePerm(ctx, row, employeeIndex(ctx));
    });
  }
  function decidePermission(ctx, input) {
    const { deps: deps2 } = ctx;
    const id = str(input.id, "Permission", { max: 60 });
    const decision = oneOf(input.decision, ["APPROVED", "REJECTED"], "Decision");
    const note = str(input.note, "Note", { max: 300, optional: decision === "APPROVED" });
    return deps2.lock.run(() => {
      const row = permRows(ctx).find((r) => r.id === id);
      if (!row) throw notFound("Permission");
      if (row.status !== "PENDING") throw conflict("This permission has already been decided.");
      const emp = requireEmployee(ctx, row.employeeId);
      if (!canApproveLeave(ctx, emp)) throw forbidden("Only this employee's manager or HR can decide this request.");
      const at = nowIso(deps2);
      const next = deps2.store.update("permissions", id, {
        status: decision,
        decidedById: ctx.principal.userId,
        decidedAt: at,
        decisionNote: note,
        updatedAt: at
      });
      audit(ctx, { action: `PERMISSION.${decision}`, capacity: "MANAGER", entityType: "permission", entityId: id, before: row, after: next, reason: note });
      notifyLeave(
        ctx,
        emp.email,
        `Your permission request was ${decision === "APPROVED" ? "approved" : "rejected"}`,
        `Your request to leave ${fmtMins(Number(row.minutes))} early on ${row.date} was ${decision === "APPROVED" ? "approved" : "rejected"}.

${note ? `Note: ${note}` : ""}`
      );
      return shapePerm(ctx, next, employeeIndex(ctx));
    });
  }
  function cancelPermission(ctx, input) {
    const { deps: deps2 } = ctx;
    const id = str(input.id, "Permission", { max: 60 });
    const why = reason(input.reason);
    return deps2.lock.run(() => {
      const row = permRows(ctx).find((r) => r.id === id);
      if (!row) throw notFound("Permission");
      if (PERM_OPEN.indexOf(row.status) < 0) throw conflict("This permission is already closed.");
      const mine = row.employeeId === ctx.principal.employeeId;
      const hr = can(ctx.principal, "leave.manage");
      if (!mine && !hr) throw forbidden();
      if (mine && !hr && row.status === "APPROVED" && row.date < today(deps2)) {
        throw invalid("A permission that has already passed can only be cancelled by HR.");
      }
      const at = nowIso(deps2);
      const next = deps2.store.update("permissions", id, {
        status: "CANCELLED",
        cancelledAt: at,
        cancelledById: ctx.principal.userId,
        cancelReason: why,
        updatedAt: at
      });
      audit(ctx, { action: "PERMISSION.CANCEL", capacity: hr && !mine ? "HR" : "SELF", entityType: "permission", entityId: id, before: row, after: next, reason: why });
      return shapePerm(ctx, next, employeeIndex(ctx));
    });
  }
  function pendingPermissions(ctx) {
    const byId = employeeIndex(ctx);
    return permRows(ctx).filter((r) => {
      if (r.status !== "PENDING") return false;
      const emp = byId.get(r.employeeId);
      return !!emp && !emp.deletedAt && canApproveLeave(ctx, emp);
    }).sort((a, b) => a.date > b.date ? 1 : -1).map((r) => shapePerm(ctx, r, byId));
  }

  // src/services/slack.ts
  var SLACK_MAX_SKEW_SEC = 300;
  var SLACK_DAY_NAMES = {
    sunday: 0, sun: 0, "الاحد": 0, "الأحد": 0,
    monday: 1, mon: 1, "الاتنين": 1, "الإثنين": 1, "الاثنين": 1,
    tuesday: 2, tue: 2, tues: 2, "الثلاثاء": 2, "التلات": 2,
    wednesday: 3, wed: 3, "الاربع": 3, "الأربعاء": 3, "الاربعاء": 3,
    thursday: 4, thu: 4, thur: 4, thurs: 4, "الخميس": 4,
    friday: 5, fri: 5, "الجمعة": 5,
    saturday: 6, sat: 6, "السبت": 6
  };
  function timingSafeEqual(a, b) {
    if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }
  function verifySlackSignature(deps2, rawBody, timestamp, signature) {
    const secret = deps2.settings.get("SLACK_SIGNING_SECRET");
    if (!secret) throw new Error("SLACK_SIGNING_SECRET is not set. Run setup() and add it.");
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    const skew = Math.abs(Math.floor(deps2.clock.now().getTime() / 1e3) - ts);
    if (skew > SLACK_MAX_SKEW_SEC) return false;
    const expected = "v0=" + deps2.crypto.hmacSha256Hex(secret, `v0:${timestamp}:${rawBody}`);
    return timingSafeEqual(expected, String(signature || ""));
  }
  function parseFormBody(raw) {
    const out = {};
    for (const part of String(raw || "").split("&")) {
      if (!part) continue;
      const i = part.indexOf("=");
      const k = decodeURIComponent((i < 0 ? part : part.slice(0, i)).replace(/\+/g, " "));
      const v = i < 0 ? "" : decodeURIComponent(part.slice(i + 1).replace(/\+/g, " "));
      out[k] = v;
    }
    return out;
  }
  function parseSlackDate(text, todayStr) {
    const t = String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!t || t === "today" || t === "النهاردة" || t === "النهارده" || t === "اليوم") return todayStr;
    if (t === "tomorrow" || t === "tmrw" || t === "بكرة" || t === "بكره" || t === "غدا") return addDays(todayStr, 1);
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return t;
    m = t.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
    if (m) {
      const d = Number(m[1]), mo = Number(m[2]);
      let y = m[3] ? Number(m[3]) : Number(todayStr.slice(0, 4));
      if (y < 100) y += 2e3;
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
    }
    const has = (k) => Object.prototype.hasOwnProperty.call(SLACK_DAY_NAMES, k);
    const key = has(t) ? t : t.replace(/^(next|on)\s+/, "").trim();
    if (has(key)) {
      const want = SLACK_DAY_NAMES[key];
      const cur = toUtc(todayStr).getUTCDay();
      let delta = (want - cur + 7) % 7;
      if (delta === 0) delta = 7;
      return addDays(todayStr, delta);
    }
    return null;
  }
  var SLACK_FORM_METHODS = ["users.info", "users.lookupByEmail", "users.profile.get", "conversations.open"];
  function slackApi(deps2, method, payload) {
    const token = deps2.settings.get("SLACK_BOT_TOKEN");
    if (!token) throw new Error("SLACK_BOT_TOKEN is not set.");
    const data = payload || {};
    const useForm = SLACK_FORM_METHODS.indexOf(method) >= 0;
    const opts = useForm ? {
      method: "post",
      contentType: "application/x-www-form-urlencoded; charset=utf-8",
      headers: { Authorization: `Bearer ${token}` },
      payload: Object.keys(data).map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(data[k]))}`).join("&"),
      muteHttpExceptions: true
    } : {
      method: "post",
      contentType: "application/json; charset=utf-8",
      headers: { Authorization: `Bearer ${token}` },
      payload: JSON.stringify(data),
      muteHttpExceptions: true
    };
    const res = deps2.http.fetch(`https://slack.com/api/${method}`, opts);
    let body;
    try {
      body = JSON.parse(res.body);
    } catch (err) {
      throw new Error(`Slack ${method} returned a non-JSON response.`);
    }
    if (!body.ok) throw new Error(`Slack ${method} failed: ${body.error}`);
    return body;
  }
  function slackCache(deps2) {
    return deps2.cache || { get: () => null, put: () => {
    } };
  }
  function slackEmailOf(deps2, slackUserId) {
    var _a, _b;
    const cache = slackCache(deps2);
    const key = `slack.email.${slackUserId}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const body = slackApi(deps2, "users.info", { user: slackUserId });
    const email = (_b = (_a = body.user) == null ? void 0 : _a.profile) == null ? void 0 : _b.email;
    if (!email) throw new Error("Slack did not return an email for this user.");
    const clean = String(email).trim().toLowerCase();
    cache.put(key, clean, 21600);
    return clean;
  }
  function slackDm(deps2, email, text) {
    if (!email) return false;
    try {
      const cache = slackCache(deps2);
      const key = `slack.id.${email}`;
      let id = cache.get(key);
      if (!id) {
        id = slackApi(deps2, "users.lookupByEmail", { email }).user.id;
        cache.put(key, id, 21600);
      }
      slackApi(deps2, "chat.postMessage", { channel: id, text });
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }
  function slackReply(text, ephemeral) {
    return { response_type: ephemeral === false ? "in_channel" : "ephemeral", text };
  }
  function slackPrincipalFor(deps2, emp) {
    const user = deps2.store.all("users").find((u) => u.employeeId === emp.id && u.isActive !== false);
    const roles = user ? deps2.store.all("user_roles").filter((r) => r.userId === user.id && !r.revokedAt).map((r) => r.role) : ["EMPLOYEE"];
    return { userId: user ? user.id : null, employeeId: emp.id, roles: roles.length ? roles : ["EMPLOYEE"], userAgent: "slack" };
  }
  function slackNotifyManager(ctx, emp, row, outcome) {
    const { deps: deps2 } = ctx;
    const mgr = emp.managerId ? deps2.store.all("employees").find((e2) => e2.id === emp.managerId) : null;
    const primary = mgr ? mgr.email : deps2.settings.get("HR_REPLY_TO");
    const extra = String(deps2.settings.get("WFH_NOTIFY_EXTRA") || "").split(/[,;\s]+/);
    const seen = {};
    const targets = [];
    for (const raw of [primary].concat(extra)) {
      const one = String(raw || "").trim().toLowerCase();
      if (!one || one.indexOf("@") < 0 || seen[one]) continue;
      seen[one] = true;
      targets.push(one);
    }
    const verb = outcome === "APPROVED" ? "auto-approved" : "auto-rejected";
    const line = outcome === "APPROVED" ? `:white_check_mark: *${emp.fullName}* will work from home on *${row.date}*. Auto-approved: it meets the WFH policy. Open iSkala HR if you need to cancel it.` : `:no_entry: *${emp.fullName}* asked to work from home on *${row.date}* and it was auto-rejected.\n> ${row.decisionNote}`;
    for (const to of targets) {
      try {
        if (!slackDm(deps2, to, line)) {
          notifyLeave(ctx, to, `WFH ${verb}: ${emp.fullName} on ${row.date}`, line.replace(/[*>:]/g, "").replace(/white_check_mark|no_entry/g, "").trim());
        }
      } catch (err) {
        console.error(err);
      }
    }
  }
  function recordWfhRejection(ctx, emp, day, why, message) {
    const { deps: deps2 } = ctx;
    const at = nowIso(deps2);
    const row = deps2.store.insert("wfh_requests", {
      id: deps2.crypto.uuid(),
      employeeId: emp.id,
      date: day,
      reason: why,
      status: "REJECTED",
      requestedById: ctx.principal.userId,
      createdAt: at,
      decidedById: null,
      decidedAt: at,
      decisionNote: message,
      cancelledAt: null,
      cancelledById: null,
      cancelReason: null,
      source: "SLACK",
      updatedAt: at
    });
    audit(ctx, { action: "WFH.AUTO_REJECTED", capacity: "SYSTEM", entityType: "wfh_request", entityId: row.id, after: row, reason: message });
    return row;
  }
  function slackWfh(deps2, params) {
    var _a;
    const slackUserId = String(params.user_id || "");
    if (!slackUserId) return slackReply("I could not tell who you are in Slack. Try again from the Slack app.");
    const text = String((_a = params.text) != null ? _a : "").trim();
    if (/^(help|\?)$/i.test(text)) {
      return slackReply("*How to use /wfh*\n`/wfh` : today\n`/wfh tomorrow`\n`/wfh sunday`\n`/wfh 2026-10-05`\n`/wfh 5/10`\nAdd a reason after the date if you like: `/wfh tomorrow doctor appointment`");
    }
    const now = deps2.zone.localDate(deps2.clock.now());
    const bits = text.split(" ");
    let day = parseSlackDate(text, now);
    let why = null;
    if (!day) {
      for (let take = Math.min(2, bits.length); take >= 1; take--) {
        const cand = parseSlackDate(bits.slice(0, take).join(" "), now);
        if (cand) {
          day = cand;
          why = bits.slice(take).join(" ").trim() || null;
          break;
        }
      }
    }
    if (!day) {
      return slackReply(`I could not read a date from "${text}". Try \`/wfh tomorrow\`, \`/wfh sunday\` or \`/wfh 2026-10-05\`. Send \`/wfh help\` for all the formats.`);
    }
    let email;
    try {
      email = slackEmailOf(deps2, slackUserId);
    } catch (err) {
      console.error(err);
      return slackReply("I could not read your email from Slack, so I cannot match you to your HR record. Ask HR to check the Slack app permissions.");
    }
    const emp = deps2.store.all("employees").find((e2) => !e2.deletedAt && String(e2.email || "").trim().toLowerCase() === email);
    if (!emp) {
      return slackReply(`Your Slack email (${email}) does not match any employee in iSkala HR. Ask HR to line them up.`);
    }
    const ctx = { deps: deps2, principal: slackPrincipalFor(deps2, emp) };
    try {
      const created = submitWfh(ctx, { employeeId: emp.id, date: day, reason: why, source: "SLACK" });
      const decided = decideWfh(
        { deps: deps2, principal: { userId: null, employeeId: null, roles: ["HR"], userAgent: "slack" } },
        { id: created.id, decision: "APPROVED", note: "Auto-approved from Slack: meets the WFH policy." }
      );
      const reply = slackReply(`:white_check_mark: Approved. You are working from home on *${day}*.${why ? `\nReason: ${why}` : ""}\nIt is recorded in iSkala HR and your manager has been told.`);
      reply.__after = () => slackNotifyManager(ctx, emp, decided, "APPROVED");
      return reply;
    } catch (err) {
      const message = err && err.message ? String(err.message) : "Your request could not be processed.";
      const isRule = err && (err.code === "VALIDATION" || err.code === "CONFLICT");
      if (!isRule) {
        console.error(err);
        return slackReply("Something went wrong on the HR side. Please try again, or use the HR site.");
      }
      let row = null;
      try {
        row = recordWfhRejection(ctx, emp, day, why, message);
      } catch (e2) {
        console.error(e2);
      }
      const reply = slackReply(`:no_entry: Not approved for *${day}*.\n> ${message}`);
      if (row) reply.__after = () => slackNotifyManager(ctx, emp, row, "REJECTED");
      return reply;
    }
  }
  function slackAuthorized(deps2, e, raw, params) {
    var _a, _b, _c;
    const headers = (_a = e && e.headers) != null ? _a : {};
    const pick = (name) => {
      const lower = name.toLowerCase();
      for (const k of Object.keys(headers)) if (k.toLowerCase() === lower) return headers[k];
      return null;
    };
    const sig = pick("X-Slack-Signature");
    const ts = pick("X-Slack-Request-Timestamp");
    if (sig && ts) return verifySlackSignature(deps2, raw, ts, sig);
    const secret = deps2.settings.get("SLACK_URL_SECRET");
    if (!secret) throw new Error("SLACK_URL_SECRET is not set. Add it and put ?k=<secret> on the Slack request URL.");
    const given = (_c = (_b = e && e.parameter) == null ? void 0 : _b.k) != null ? _c : "";
    if (!timingSafeEqual(String(secret), String(given))) return false;
    const team = deps2.settings.get("SLACK_TEAM_ID");
    if (team && params.team_id && String(params.team_id) !== String(team)) return false;
    return true;
  }
  function handleSlack(deps2, e) {
    var _a, _b;
    const raw = (_b = (_a = e && e.postData) == null ? void 0 : _a.contents) != null ? _b : "";
    const params = parseFormBody(raw);
    if (!slackAuthorized(deps2, e, raw, params)) {
      return { status: 401, body: "Not authorized." };
    }
    if (params.ssl_check === "1") return { status: 200, body: "" };
    const cmd = String(params.command || "").toLowerCase();
    if (cmd !== "/wfh") {
      return { status: 200, json: slackReply(`I do not know the command ${cmd || "(none)"}.`) };
    }
    let out;
    try {
      out = slackWfh(deps2, params);
    } catch (err) {
      console.error(err);
      out = slackReply("Something went wrong on the HR side. Please try again, or use the HR site.");
    }
    const after = out.__after;
    delete out.__after;
    if (params.response_url) {
      try {
        deps2.http.fetch(params.response_url, {
          method: "post",
          contentType: "application/json; charset=utf-8",
          payload: JSON.stringify(out),
          muteHttpExceptions: true
        });
      } catch (err) {
        console.error(err);
      }
    }
    if (typeof after === "function") {
      try {
        after();
      } catch (err) {
        console.error(err);
      }
    }
    return { status: 200, json: out };
  }

  // src/services/home.ts
  function homeFeed(ctx) {
    const now = today(ctx.deps);
    const emps = ctx.deps.store.all("employees").filter((x) => !x.deletedAt && x.employmentStatus !== "TERMINATED");
    const byId = new Map(emps.map((x) => [x.id, x]));
    const photos = photoMap(ctx);
    const person = (x) => ({ id: x.id, fullName: x.fullName, photo: photos.get(x.id) || null });
    const out = new Map();
    const mark = (id, status) => {
      const x = byId.get(id);
      if (x && !out.has(id)) out.set(id, { ...person(x), status });
    };
    leaveRows(ctx).forEach((r) => {
      if (r.status === "APPROVED" && r.startDate <= now && r.endDate >= now) mark(r.employeeId, "On leave");
    });
    wfhRows(ctx).forEach((r) => {
      if (r.status === "APPROVED" && r.date === now) mark(r.employeeId, "WFH");
    });
    permRows(ctx).forEach((r) => {
      if (r.status === "APPROVED" && r.date === now) mark(r.employeeId, "Leaving early");
    });
    const days = [];
    for (let i = 0; i < 14; i++) days.push(addDays(now, i));
    const celebrations = [];
    emps.forEach((x) => {
      days.forEach((d) => {
        const md = d.slice(5);
        if (x.birthDate && String(x.birthDate).slice(5) === md) celebrations.push({ ...person(x), kind: "BIRTHDAY", date: d });
        if (x.hireDate && String(x.hireDate).slice(5) === md) {
          const years = Number(d.slice(0, 4)) - Number(String(x.hireDate).slice(0, 4));
          if (years >= 1) celebrations.push({ ...person(x), kind: "ANNIVERSARY", years, date: d });
        }
      });
    });
    celebrations.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    const next = active(ctx).filter((h) => h.date >= now).sort((a, b) => a.date < b.date ? -1 : 1)[0] || null;
    return {
      today: now,
      outToday: [...out.values()].sort((a, b) => a.fullName < b.fullName ? -1 : 1),
      celebrations: celebrations.slice(0, 8),
      nextHoliday: next && { date: next.date, name: next.name }
    };
  }
  // src/services/approvals-context.ts
  function approvalsContext(ctx) {
    const out = {};
    const now = today(ctx.deps);
    const emps = new Map(ctx.deps.store.all("employees").filter((x) => !x.deletedAt && x.employmentStatus !== "TERMINATED").map((x) => [x.id, x]));
    const leaves = leaveRows(ctx);
    const wfhs = wfhRows(ctx);
    const perms = permRows(ctx);
    const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
    pendingLeave(ctx).forEach((r) => {
      const others = new Set(leaves.filter((x) => x.id !== r.id && x.employeeId !== r.employeeId && emps.has(x.employeeId) && LEAVE_OPEN.indexOf(x.status) >= 0 && x.startDate <= r.endDate && x.endDate >= r.startDate).map((x) => x.employeeId));
      out[r.id] = others.size ? `${plural(others.size, "other person")} out those days`.replace("persons", "people") : "Nobody else is out those days";
    });
    const cfg = policyOn(ctx.deps, now).config;
    const limits = permLimits(cfg);
    pendingPermissions(ctx).forEach((r) => {
      const used = permUsed(perms, r.employeeId, (x) => monthOf(x.date) === monthOf(r.date));
      out[r.id] = `${fmtMins(Math.max(0, limits.monthly - used))} left that month after this`;
    });
    pendingWfh(ctx).forEach((r) => {
      const n = wfhs.filter((x) => x.id !== r.id && x.employeeId === r.employeeId && WFH_OPEN.indexOf(x.status) >= 0 && weekStartOf(x.date) === weekStartOf(r.date)).length;
      out[r.id] = n ? `Already has ${plural(n, "WFH day")} that week` : "First WFH day that week";
    });
    return out;
  }
  var HANDLERS = {
    "home.feed": (ctx) => homeFeed(ctx),
    "approvals.context": (ctx) => approvalsContext(ctx),
    "me.get": (ctx) => {
      var _a;
      const p = ctx.principal;
      const employee = (_a = ctx.deps.store.all("employees").find((e) => e.id === p.employeeId)) != null ? _a : null;
      return {
        email: p.email,
        roles: p.roles,
        employee: employee && { id: employee.id, fullName: employee.fullName, jobTitle: employee.jobTitle, photo: photoMap(ctx).get(employee.id) || null },
        can: {
          manageEmployees: can(p, "employee.write"),
          manageHolidays: can(p, "holiday.write"),
          manageRoles: can(p, "roles.write"),
          readAudit: can(p, "audit.read"),
          manageLeave: can(p, "leave.manage"),
          approveLeaveAny: can(p, "leave.approve.any"),
          hasTeam: p.employeeId !== null && ctx.deps.store.all("employees").some((x) => !x.deletedAt && x.managerId === p.employeeId)
        }
      };
    },
    "departments.list": (ctx) => listDepartments(ctx),
    "departments.create": (ctx, p) => createDepartment(ctx, { name: p.name, code: p.code }),
    "schedules.list": (ctx) => {
      authorize(ctx.principal, "schedule.read");
      return listSchedules(ctx);
    },
    "employees.list": (ctx) => listEmployees(ctx),
    "employees.get": (ctx, p) => getEmployee(ctx, p.id),
    "employees.create": (ctx, p) => createEmployee(ctx, p),
    "employees.updateDetails": (ctx, p) => updateDetails(ctx, { id: p.id, changes: obj(p.changes, "Changes"), reason: p.reason }),
    "employees.changeAssignment": (ctx, p) => changeAssignment(ctx, {
      id: p.id,
      departmentId: p.departmentId,
      managerId: p.managerId,
      scheduleId: p.scheduleId,
      effectiveFrom: p.effectiveFrom,
      reason: p.reason
    }),
    "employees.setStatus": (ctx, p) => setStatus(ctx, { id: p.id, status: p.status, effectiveFrom: p.effectiveFrom, reason: p.reason }),
    "users.setRoles": (ctx, p) => setRoles(ctx, { userId: p.userId, roles: p.roles, reason: p.reason }),
    "employees.setPhoto": (ctx, p) => setPhoto(ctx, { id: p.id, photo: p.photo }),
    "documents.list": (ctx, p) => listDocuments(ctx, p.employeeId),
    "documents.upload": (ctx, p) => uploadDocument(ctx, p),
    "documents.download": (ctx, p) => downloadDocument(ctx, p.id),
    "documents.remove": (ctx, p) => removeDocument(ctx, { id: p.id, reason: p.reason }),
    "holidays.list": (ctx, p) => listHolidays(ctx, p.year),
    "holidays.add": (ctx, p) => addHoliday(ctx, { date: p.date, name: p.name, groupKey: p.groupKey }),
    "holidays.remove": (ctx, p) => removeHoliday(ctx, { id: p.id, reason: p.reason }),
    "audit.list": (ctx, p) => {
      authorize(ctx.principal, "audit.read");
      return listAudit(ctx, {
        entityType: typeof p.entityType === "string" ? p.entityType : void 0,
        entityId: typeof p.entityId === "string" ? p.entityId : void 0,
        limit: typeof p.limit === "number" ? p.limit : void 0
      });
    },
    "leave.summary": (ctx, p) => leaveSummary(ctx, { employeeId: p.employeeId, year: p.year }),
    "leave.request": (ctx, p) => submitLeave(ctx, { employeeId: p.employeeId, type: p.type, startDate: p.startDate, endDate: p.endDate, reason: p.reason }),
    "leave.decide": (ctx, p) => decideLeave(ctx, { id: p.id, decision: p.decision, note: p.note }),
    "leave.cancel": (ctx, p) => cancelLeave(ctx, { id: p.id, reason: p.reason }),
    "leave.pending": (ctx) => pendingLeave(ctx),
    "permissions.request": (ctx, p) => submitPermission(ctx, { employeeId: p.employeeId, date: p.date, minutes: p.minutes, fromTime: p.fromTime, reason: p.reason }),
    "permissions.decide": (ctx, p) => decidePermission(ctx, { id: p.id, decision: p.decision, note: p.note }),
    "permissions.cancel": (ctx, p) => cancelPermission(ctx, { id: p.id, reason: p.reason }),
    "permissions.pending": (ctx) => pendingPermissions(ctx),
    "wfh.request": (ctx, p) => submitWfh(ctx, { employeeId: p.employeeId, date: p.date, reason: p.reason }),
    "wfh.decide": (ctx, p) => decideWfh(ctx, { id: p.id, decision: p.decision, note: p.note }),
    "wfh.cancel": (ctx, p) => cancelWfh(ctx, { id: p.id, reason: p.reason }),
    "wfh.pending": (ctx) => pendingWfh(ctx),
    "leave.adjust": (ctx, p) => adjustLeave(ctx, { employeeId: p.employeeId, type: p.type, year: p.year, days: p.days, reason: p.reason }),
    "leave.overview": (ctx, p) => leaveOverview(ctx, { year: p.year }),
    "policy.current": (ctx) => {
      authorize(ctx.principal, "policy.read");
      return policyOn(ctx.deps, ctx.deps.zone.localDate(ctx.deps.clock.now()));
    }
  };
  var ACTIONS = Object.keys(HANDLERS);
  function handle(deps2, req, log) {
    try {
      const r = obj(req);
      const action = typeof r.action === "string" ? r.action : "";
      const payload = r.payload === void 0 ? {} : obj(r.payload);
      const userAgent = typeof r.userAgent === "string" ? r.userAgent.slice(0, 300) : null;
      if (action === "auth.requestCode") return { ok: true, data: requestCode(deps2, currentPolicy(deps2), payload.email) };
      if (action === "auth.verifyCode") {
        return { ok: true, data: verifyCode(deps2, currentPolicy(deps2), { email: payload.email, code: payload.code, remember: payload.remember, userAgent }) };
      }
      if (action === "auth.logout") {
        logout(deps2, r.token);
        return { ok: true, data: null };
      }
      const handler = HANDLERS[action];
      if (!handler) throw invalid("Unknown action.");
      const principal = resolveSession(deps2, r.token, userAgent);
      return { ok: true, data: handler({ deps: deps2, principal }, payload) };
    } catch (e) {
      if (e instanceof AppError) return { ok: false, error: { code: e.code, message: e.message } };
      const ref = Math.random().toString(36).slice(2, 10).toUpperCase();
      log(e, ref);
      return { ok: false, error: { code: "INTERNAL", message: `Something went wrong. Please try again. (Ref ${ref})`, ref } };
    }
  }

  // src/data/schema.ts
  var TABLES = {
    users: {
      columns: ["id", "email", "employeeId", "isActive", "lastLoginAt", "createdAt", "updatedAt"],
      types: { isActive: "bool" }
    },
    user_roles: {
      columns: ["id", "userId", "role", "grantedAt", "grantedById", "revokedAt", "revokedById"]
    },
    login_codes: {
      columns: ["id", "email", "codeHash", "expiresAt", "attempts", "usedAt", "createdAt"],
      types: { attempts: "num" }
    },
    sessions: {
      columns: ["id", "userId", "tokenHash", "createdAt", "expiresAt", "revokedAt", "userAgent"]
    },
    departments: {
      columns: ["id", "name", "code", "createdAt", "updatedAt", "deletedAt"]
    },
    employees: {
      columns: [
        "id",
        "employeeCode",
        "userId",
        "fullName",
        "email",
        "phone",
        "jobTitle",
        "departmentId",
        "managerId",
        "officeLocation",
        "hireDate",
        "endDate",
        "employmentStatus",
        "probationEndDate",
        "createdAt",
        "updatedAt",
        "deletedAt",
        "birthDate",
        "contractType",
        "companyAssets",
        "notes",
        "gender"
      ]
    },
    employee_photos: {
      columns: ["id", "employeeId", "photo", "updatedById", "updatedAt"]
    },
    employee_managers: {
      columns: ["id", "employeeId", "managerId", "effectiveFrom", "effectiveTo", "changedById", "reason", "createdAt"]
    },
    employee_department_history: {
      columns: ["id", "employeeId", "departmentId", "effectiveFrom", "effectiveTo", "changedById", "reason", "createdAt"]
    },
    employment_status_history: {
      columns: ["id", "employeeId", "status", "effectiveFrom", "effectiveTo", "changedById", "reason", "createdAt"]
    },
    work_schedules: {
      columns: [
        "id",
        "name",
        "type",
        "workDays",
        "startWindowFromMin",
        "startWindowToMin",
        "lateGraceMin",
        "dailyPresenceMin",
        "breakMin",
        "isDefault",
        "createdAt",
        "updatedAt",
        "deletedAt"
      ],
      types: {
        workDays: "json",
        startWindowFromMin: "num",
        startWindowToMin: "num",
        lateGraceMin: "num",
        dailyPresenceMin: "num",
        breakMin: "num",
        isDefault: "bool"
      }
    },
    employee_schedule_assignments: {
      columns: ["id", "employeeId", "scheduleId", "effectiveFrom", "effectiveTo", "changedById", "reason", "createdAt"]
    },
    policy_versions: {
      columns: ["id", "version", "settings", "effectiveFrom", "notes", "createdById", "createdAt"],
      types: { version: "num", settings: "json" },
      appendOnly: true
    },
    public_holidays: {
      columns: ["id", "date", "name", "groupKey", "createdById", "createdAt", "deletedAt", "deletedById", "deleteReason"]
    },
    employee_documents: {
      columns: ["id", "employeeId", "fileName", "category", "mimeType", "sizeBytes", "driveFileId", "uploadedById", "createdAt", "deletedAt", "deletedById", "deleteReason"],
      types: { sizeBytes: "num" }
    },
    leave_requests: {
      columns: [
        "id",
        "employeeId",
        "type",
        "startDate",
        "endDate",
        "days",
        "reason",
        "status",
        "requestedById",
        "createdAt",
        "decidedById",
        "decidedAt",
        "decisionNote",
        "cancelledAt",
        "cancelledById",
        "cancelReason",
        "updatedAt"
      ],
      types: { days: "num" }
    },
    permissions: {
      columns: [
        "id",
        "employeeId",
        "date",
        "minutes",
        "fromTime",
        "reason",
        "status",
        "requestedById",
        "createdAt",
        "decidedById",
        "decidedAt",
        "decisionNote",
        "cancelledAt",
        "cancelledById",
        "cancelReason",
        "updatedAt"
      ],
      types: { minutes: "num" }
    },
    wfh_requests: {
      columns: [
        "id",
        "employeeId",
        "date",
        "reason",
        "status",
        "requestedById",
        "createdAt",
        "decidedById",
        "decidedAt",
        "decisionNote",
        "cancelledAt",
        "cancelledById",
        "cancelReason",
        "updatedAt",
        "source"
      ]
    },
    leave_adjustments: {
      columns: ["id", "employeeId", "year", "type", "days", "reason", "createdById", "createdAt"],
      types: { year: "num", days: "num" },
      appendOnly: true
    },
    audit_logs: {
      columns: [
        "id",
        "createdAt",
        "actorId",
        "capacity",
        "action",
        "entityType",
        "entityId",
        "before",
        "after",
        "reason",
        "userAgent"
      ],
      types: { before: "json", after: "json" },
      appendOnly: true
    }
  };
  var TABLE_NAMES = Object.keys(TABLES);
  function tableDef(name) {
    return TABLES[name];
  }

  // src/data/codec.ts
  function decodeCell(raw, type) {
    const s = raw === null || raw === void 0 ? "" : String(raw);
    if (s === "") return null;
    switch (type) {
      case "num": {
        const n = Number(s);
        if (!Number.isFinite(n)) throw new Error(`Not a number: ${s}`);
        return n;
      }
      case "bool":
        return s === "true";
      default:
        return s;
    }
  }
  function encodeCell(value) {
    if (value === null || value === void 0) return "";
    return String(value);
  }
  function decodeRow(table, headers, values) {
    var _a;
    const types = (_a = tableDef(table).types) != null ? _a : {};
    const row = {};
    headers.forEach((h, i) => {
      row[h] = decodeCell(values[i], types[h]);
    });
    if (typeof row.id !== "string" || row.id === "") throw new Error(`${table}: row without id`);
    return row;
  }
  function encodeRow(headers, row) {
    return headers.map((h) => encodeCell(row[h]));
  }

  // src/gas/adapters.ts
  var GasSettings = class {
    get(key) {
      return PropertiesService.getScriptProperties().getProperty(key);
    }
    set(key, value) {
      PropertiesService.getScriptProperties().setProperty(key, value);
    }
  };
  var GasStore = class {
    constructor(ss) {
      this.ss = ss;
      this.cache = /* @__PURE__ */ new Map();
    }
    reset() {
      this.cache.clear();
    }
    load(table) {
      var _a;
      const hit = this.cache.get(table);
      if (hit) return hit;
      const sheet = this.ss.getSheetByName(table);
      if (!sheet) throw new Error(`Missing tab "${table}". Run setup().`);
      const values = sheet.getDataRange().getValues();
      const headers = ((_a = values[0]) != null ? _a : []).map(String);
      const expected = tableDef(table).columns;
      if (expected.some((c, i) => headers[i] !== c)) throw new Error(`Tab "${table}" headers do not match the schema. Run setup().`);
      const rows = [];
      const index = /* @__PURE__ */ new Map();
      for (let i = 1; i < values.length; i++) {
        const v = values[i];
        if (v.every((x) => x === "" || x === null)) continue;
        const row = decodeRow(table, headers, v);
        index.set(row.id, i + 1);
        rows.push(row);
      }
      const loaded = { sheet, headers, rows, index };
      this.cache.set(table, loaded);
      return loaded;
    }
    all(table) {
      return this.load(table).rows.map((r) => ({ ...r }));
    }
    insert(table, row) {
      const t = this.load(table);
      if (t.index.has(row.id)) throw new Error(`${table}: duplicate id`);
      const values = encodeRow(t.headers, row);
      const at = t.sheet.getLastRow() + 1;
      t.sheet.getRange(at, 1, 1, t.headers.length).setValues([values]);
      const stored = decodeRow(table, t.headers, values);
      t.rows.push(stored);
      t.index.set(stored.id, at);
      return { ...stored };
    }
    update(table, id, patch) {
      if (tableDef(table).appendOnly) throw new AppError("APPEND_ONLY", `${table} cannot be changed.`);
      const t = this.load(table);
      const at = t.index.get(id);
      const i = t.rows.findIndex((r) => r.id === id);
      if (at === void 0 || i < 0) throw notFound(`${table} row`);
      const next = { ...t.rows[i], ...patch, id };
      const values = encodeRow(t.headers, next);
      t.sheet.getRange(at, 1, 1, t.headers.length).setValues([values]);
      t.rows[i] = decodeRow(table, t.headers, values);
      return { ...t.rows[i] };
    }
  };
  var GasLock = class {
    constructor(onAcquire) {
      this.onAcquire = onAcquire;
      this.depth = 0;
    }
    run(fn) {
      if (this.depth > 0) return fn();
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(2e4)) throw new AppError("BUSY", "The system is busy. Please try again in a moment.");
      this.depth++;
      try {
        this.onAcquire();
        return fn();
      } finally {
        this.depth--;
        SpreadsheetApp.flush();
        lock.releaseLock();
      }
    }
  };
  var gasClock = { now: () => /* @__PURE__ */ new Date() };
  var hex = (bytes) => bytes.map((b) => ((b + 256) % 256).toString(16).padStart(2, "0")).join("");
  var gasCrypto = {
    sha256Hex: (input) => hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8)),
    hmacSha256Hex: (key, message) => hex(Utilities.computeHmacSha256Signature(message, key)),
    uuid: () => Utilities.getUuid(),
    randomToken: () => Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now())
    ).replace(/=+$/, "") + Utilities.getUuid().replace(/-/g, ""),
    randomDigits: (count) => {
      let out = "";
      while (out.length < count) {
        for (const b of Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid())) {
          const v = (b + 256) % 256;
          if (v < 250 && out.length < count) out += String(v % 10);
        }
      }
      return out;
    }
  };
  var gasCache = {
    get: (key) => {
      try {
        return CacheService.getScriptCache().get(key);
      } catch (e) {
        return null;
      }
    },
    put: (key, value, seconds) => {
      try {
        CacheService.getScriptCache().put(key, value, seconds);
      } catch (e) {
        console.error(e);
      }
    }
  };
  var gasHttp = {
    fetch: (url, options) => {
      const res = UrlFetchApp.fetch(url, options);
      return { status: res.getResponseCode(), body: res.getContentText() };
    }
  };
  var GasMailer = class {
    constructor(settings) {
      this.settings = settings;
    }
    remainingQuota() {
      return MailApp.getRemainingDailyQuota();
    }
    send(m) {
      var _a;
      const replyTo = this.settings.get("HR_REPLY_TO");
      MailApp.sendEmail({
        to: m.to,
        subject: m.subject,
        body: m.text,
        htmlBody: m.html,
        name: (_a = this.settings.get("EMAIL_SENDER_NAME")) != null ? _a : "iSkala HR",
        ...replyTo ? { replyTo } : {}
      });
    }
  };

  // src/gas/setup.ts
  function runSetup(settings, makeDeps) {
    var _a, _b;
    const log = [];
    const now = /* @__PURE__ */ new Date();
    const zone = makeZone(DEFAULT_POLICY.timezone);
    const ours = `${zone.localDate(now)} ${String(Math.floor(zone.localMinutes(now) / 60)).padStart(2, "0")}:${String(zone.localMinutes(now) % 60).padStart(2, "0")}`;
    const google = Utilities.formatDate(now, DEFAULT_POLICY.timezone, "yyyy-MM-dd HH:mm");
    if (ours !== google) throw new Error(`Time zone check failed: ${ours} vs ${google}.`);
    log.push(`Time zone OK (${google} ${DEFAULT_POLICY.timezone}).`);
    if (!settings.get("AUTH_PEPPER")) {
      settings.set("AUTH_PEPPER", Utilities.getUuid() + Utilities.getUuid());
      log.push("Generated AUTH_PEPPER.");
    }
    let ssId = settings.get("SPREADSHEET_ID");
    let ss;
    if (ssId) {
      ss = SpreadsheetApp.openById(ssId);
    } else {
      ss = SpreadsheetApp.create(`iSkala HR Database (${(_a = settings.get("ENVIRONMENT")) != null ? _a : "PROD"})`);
      ssId = ss.getId();
      settings.set("SPREADSHEET_ID", ssId);
      log.push(`Created spreadsheet ${ssId}.`);
    }
    ss.setSpreadsheetTimeZone(DEFAULT_POLICY.timezone);
    for (const name of TABLE_NAMES) {
      const cols = tableDef(name).columns;
      let sheet = ss.getSheetByName(name);
      if (!sheet) {
        sheet = ss.insertSheet(name);
        log.push(`Created tab ${name}.`);
      }
      const width = Math.max(cols.length, sheet.getMaxColumns());
      sheet.getRange(1, 1, sheet.getMaxRows(), width).setNumberFormat("@");
      const header = sheet.getRange(1, 1, 1, cols.length);
      const existing = header.getValues()[0].map(String);
      if (existing.every((v) => v === "")) {
        header.setValues([[...cols]]).setFontWeight("bold");
        sheet.setFrozenRows(1);
      } else if (cols.some((c, i) => existing[i] !== c)) {
        const prefixOk = existing.filter((v) => v !== "").every((v, i) => v === cols[i]);
        if (!prefixOk) throw new Error(`Tab ${name} has unexpected headers. Fix manually before continuing.`);
        header.setValues([[...cols]]);
        log.push(`Added columns to ${name}.`);
      }
      const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      const p = (_b = protections[0]) != null ? _b : sheet.protect().setDescription("Managed by iSkala HR app");
      p.removeEditors(p.getEditors());
      if (p.canDomainEdit()) p.setDomainEdit(false);
    }
    const blank = ss.getSheetByName("Sheet1");
    if (blank && ss.getSheets().length > 1) ss.deleteSheet(blank);
    const deps2 = makeDeps(ss);
    const at = (/* @__PURE__ */ new Date()).toISOString();
    deps2.lock.run(() => {
      var _a2, _b2, _c;
      const { store, crypto } = deps2;
      if (!store.all("policy_versions").length) {
        const problems = validatePolicy(DEFAULT_POLICY);
        if (problems.length) throw new Error(problems.join(" "));
        store.insert("policy_versions", {
          id: crypto.uuid(),
          version: 1,
          settings: JSON.stringify(DEFAULT_POLICY),
          effectiveFrom: "2000-01-01",
          notes: "Initial setup from the Internal Staff Policy",
          createdById: null,
          createdAt: at
        });
        log.push("Seeded policy version 1.");
      }
      if (!store.all("work_schedules").length) {
        store.insert("work_schedules", {
          id: crypto.uuid(),
          name: "Standard flexible",
          type: "FLEXIBLE",
          workDays: JSON.stringify([0, 1, 2, 3, 4]),
          startWindowFromMin: 480,
          startWindowToMin: 660,
          lateGraceMin: 15,
          dailyPresenceMin: 480,
          breakMin: 60,
          isDefault: true,
          createdAt: at,
          updatedAt: at,
          deletedAt: null
        });
        log.push("Seeded the standard flexible schedule (Sun to Thu, 08:00 to 11:00, 8h).");
      }
      const adminEmail = ((_a2 = settings.get("ADMIN_EMAIL")) != null ? _a2 : "").trim().toLowerCase();
      const adminName = ((_b2 = settings.get("ADMIN_NAME")) != null ? _b2 : "").trim();
      if (!adminEmail || !adminName) throw new Error("Set ADMIN_EMAIL and ADMIN_NAME in Script Properties, then run setup() again.");
      if (!store.all("users").some((u) => u.email === adminEmail)) {
        let dept = store.all("departments").find((d) => d.code === "MGMT");
        if (!dept) {
          dept = store.insert("departments", { id: crypto.uuid(), name: "Management", code: "MGMT", createdAt: at, updatedAt: at, deletedAt: null });
        }
        const schedule = store.all("work_schedules").find((s) => s.isDefault);
        const employeeId = crypto.uuid();
        const userId = crypto.uuid();
        const hireDate = (_c = settings.get("ADMIN_HIRE_DATE")) != null ? _c : deps2.zone.localDate(now);
        store.insert("employees", {
          id: employeeId,
          employeeCode: "ISK-001",
          userId,
          fullName: adminName,
          email: adminEmail,
          phone: null,
          jobTitle: "CEO",
          departmentId: dept.id,
          managerId: null,
          officeLocation: null,
          hireDate,
          endDate: null,
          employmentStatus: "ACTIVE",
          probationEndDate: null,
          createdAt: at,
          updatedAt: at,
          deletedAt: null
        });
        store.insert("users", { id: userId, email: adminEmail, employeeId, isActive: true, lastLoginAt: null, createdAt: at, updatedAt: at });
        for (const role of ["EMPLOYEE", "CEO", "ADMIN"]) {
          store.insert("user_roles", { id: crypto.uuid(), userId, role, grantedAt: at, grantedById: null, revokedAt: null, revokedById: null });
        }
        const hist = { employeeId, effectiveFrom: hireDate, effectiveTo: null, changedById: userId, reason: "Initial setup", createdAt: at };
        store.insert("employee_department_history", { id: crypto.uuid(), departmentId: dept.id, ...hist });
        store.insert("employment_status_history", { id: crypto.uuid(), status: "ACTIVE", ...hist });
        store.insert("employee_schedule_assignments", { id: crypto.uuid(), scheduleId: schedule.id, ...hist });
        store.insert("audit_logs", {
          id: crypto.uuid(),
          createdAt: at,
          actorId: null,
          capacity: "SYSTEM",
          action: "SETUP.ADMIN",
          entityType: "user",
          entityId: userId,
          before: null,
          after: JSON.stringify({ email: adminEmail, roles: ["EMPLOYEE", "CEO", "ADMIN"] }),
          reason: "Initial setup",
          userAgent: null
        });
        log.push(`Created the first CEO/Admin account for ${adminEmail}.`);
      }
    });
    log.push("Setup complete.");
    return log;
  }

  // src/gas/main.ts
  function buildDeps(ss, settings) {
    const store = new GasStore(ss);
    return {
      store,
      lock: new GasLock(() => store.reset()),
      clock: gasClock,
      crypto: gasCrypto,
      http: gasHttp,
      cache: gasCache,
      mailer: new GasMailer(settings),
      settings,
      zone: makeZone(DEFAULT_POLICY.timezone)
    };
  }
  function deps() {
    const settings = new GasSettings();
    const id = settings.get("SPREADSHEET_ID");
    if (!id) throw new Error("SPREADSHEET_ID is not set. Run setup().");
    return buildDeps(SpreadsheetApp.openById(id), settings);
  }
  function lazyDeps() {
    const settings = new GasSettings();
    let heavy = null;
    const open = () => {
      if (!heavy) {
        const id = settings.get("SPREADSHEET_ID");
        if (!id) throw new Error("SPREADSHEET_ID is not set. Run setup().");
        heavy = buildDeps(SpreadsheetApp.openById(id), settings);
      }
      return heavy;
    };
    return {
      settings,
      clock: gasClock,
      crypto: gasCrypto,
      http: gasHttp,
      cache: gasCache,
      zone: makeZone(DEFAULT_POLICY.timezone),
      get store() {
        return open().store;
      },
      get lock() {
        return open().lock;
      },
      get mailer() {
        return open().mailer;
      }
    };
  }
  function doGet() {
    const out = HtmlService.createHtmlOutputFromFile("Index").setTitle("iSkala HR").addMetaTag("viewport", "width=device-width, initial-scale=1").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    const fav = PropertiesService.getScriptProperties().getProperty("FAVICON_URL");
    if (fav) {
      try {
        out.setFaviconUrl(fav);
      } catch (e) {
        console.error(e);
      }
    }
    return out;
  }
  function doPost(e) {
    let out;
    try {
      out = handleSlack(lazyDeps(), e);
    } catch (err) {
      console.error(err);
      out = { status: 200, json: { response_type: "ephemeral", text: "iSkala HR is not set up for Slack yet. Ask an admin to check the configuration." } };
    }
    if (out.json) {
      return ContentService.createTextOutput(JSON.stringify(out.json)).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(out.body || "");
  }
  function api(request) {
    try {
      return handle(deps(), request, (e, ref) => console.error(`[${ref}]`, e instanceof Error ? e.stack : e));
    } catch (e) {
      console.error(e);
      return { ok: false, error: { code: "INTERNAL", message: "The system is not configured yet. Contact HR." } };
    }
  }
  function apiBatch(requests) {
    const list = Array.isArray(requests) ? requests.slice(0, 20) : [];
    let d;
    try {
      d = deps();
    } catch (e) {
      console.error(e);
      return list.map(() => ({ ok: false, error: { code: "INTERNAL", message: "The system is not configured yet. Contact HR." } }));
    }
    return list.map((r) => handle(d, r, (e, ref) => console.error(`[${ref}]`, e instanceof Error ? e.stack : e)));
  }
  function setup() {
    const settings = new GasSettings();
    for (const line of runSetup(settings, (ss) => buildDeps(ss, settings))) console.log(line);
  }
  return __toCommonJS(main_exports);
})();
function doGet(e) { return HR.doGet(e); }
function doPost(e) {
  // Web app (GitHub Pages) calls arrive with ?api=1 and a JSON body.
  // Everything else (Slack /wfh) goes to the original handler, unchanged.
  if (e && e.parameter && e.parameter.api === "1") {
    var out;
    try {
      var list = JSON.parse((e.postData && e.postData.contents) || "[]");
      out = HR.apiBatch(list);
    } catch (err) {
      console.error(err);
      out = [{ ok: false, error: { code: "INTERNAL", message: "Bad request." } }];
    }
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  }
  return HR.doPost(e);
}
function api(request) { return HR.api(request); }
function apiBatch(requests) { return HR.apiBatch(requests); }
function setup() { return HR.setup(); }
