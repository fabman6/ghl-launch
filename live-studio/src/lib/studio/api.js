import { base44 } from "@/api/base44Client";

/** Invoke a backend function and surface its { error } message on failure. */
export async function invokeFn(name, data) {
  try {
    const res = await base44.functions.invoke(name, data);
    return { data: res?.data ?? res };
  } catch (e) {
    const msg = e?.response?.data?.error || e?.data?.error || e?.message || "Request failed";
    const err = new Error(msg);
    err.status = e?.response?.status ?? e?.status;
    throw err;
  }
}
