// PROTOTYPE — throwaway spike for "Does Knock hold up against Cadence?" (issue #41).
// Lives on the prototype/knock-spike branch only. Never merge.
// Open /prototype/knock, switch users with the DevUI panel, and walk the four checks.
import { useCallback, useEffect, useState } from "react";
import { data, useFetcher } from "react-router";
import type { Route } from "./+types/prototype.knock";
import { getCurrentUserId } from "~/lib/session";
import {
  findDiscussionReply,
  findEnrollment,
  identify,
  knock,
  knockClientConfig,
  signTokenFor,
} from "~/lib/knock-prototype.server";

const KNOCK_API = "https://api.knock.app/v1";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) return { userId: null } as const;
  const user = await identify(userId);
  const token = await signTokenFor(userId);
  const preferences = await knock.users
    .getPreferences(String(userId), "default")
    .catch((e) => ({ error: String(e.message) }));
  return {
    userId,
    userName: user.name,
    role: user.role,
    token,
    preferences,
    reply: findDiscussionReply() ?? null,
    enrollment: findEnrollment() ?? null,
    ...knockClientConfig(),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw data("Select a user", { status: 401 });
  const intent = String((await request.formData()).get("intent"));
  try {
    if (intent === "trigger-reply") {
      const r = findDiscussionReply();
      if (!r) return { intent, error: "No Discussion Reply in the seed data" };
      await identify(r.replierId);
      await identify(r.questionAuthorId);
      const res = await knock.workflows.trigger("discussion-reply", {
        recipients: [String(r.questionAuthorId)],
        actor: String(r.replierId),
        data: {
          replier_name: r.replierName,
          lesson_title: r.lessonTitle,
          reply_excerpt: r.replyBody.slice(0, 140),
          url: `/lessons/${r.lessonId}#comment-${r.replyId}`,
        },
      });
      return { intent, result: res };
    }
    if (intent === "trigger-enrollment") {
      const e = findEnrollment();
      if (!e) return { intent, error: "No Enrollment in the seed data" };
      await identify(e.studentId);
      await identify(e.instructorId);
      const res = await knock.workflows.trigger("new-enrollment", {
        recipients: [String(e.instructorId)],
        actor: String(e.studentId),
        data: { student_name: e.studentName, course_title: e.courseTitle },
      });
      return { intent, result: res };
    }
    if (intent === "opt-in" || intent === "opt-out") {
      const res = await knock.users.setPreferences(String(userId), "default", {
        __persistence_strategy__: "merge",
        // Category × channel: the "enrollments" category on the in-app feed channel type.
        categories: {
          enrollments: { channel_types: { in_app_feed: intent === "opt-in" } },
        },
      });
      return { intent, result: res };
    }
    if (intent === "clear-prefs") {
      const res = await knock.users.setPreferences(String(userId), "default", {
        __persistence_strategy__: "replace",
      });
      return { intent, result: res };
    }
    return { intent, error: "Unknown intent" };
  } catch (e) {
    return { intent, error: e instanceof Error ? e.message : String(e) };
  }
}

type FeedState = {
  status?: number;
  body?: any;
  error?: string;
};

export default function KnockPrototype({ loaderData }: Route.ComponentProps) {
  const fetcher = useFetcher<typeof action>();
  const [feed, setFeed] = useState<FeedState>({});
  const [probe, setProbe] = useState<FeedState>({});
  const [batchResult, setBatchResult] = useState<FeedState>({});

  const ld = loaderData.userId ? loaderData : null;

  const headers = useCallback(
    (): HeadersInit =>
      ld
        ? {
            Authorization: `Bearer ${ld.publicKey}`,
            "X-Knock-User-Token": ld.token,
            "Content-Type": "application/json",
          }
        : {},
    [ld?.token, ld?.publicKey]
  );

  const loadFeed = useCallback(async () => {
    if (!ld) return;
    const res = await fetch(
      `${KNOCK_API}/users/${ld.userId}/feeds/${ld.feedChannelId}?page_size=20`,
      { headers: headers() }
    );
    setFeed({ status: res.status, body: await res.json().catch(() => null) });
  }, [ld?.userId, ld?.feedChannelId, headers]);

  useEffect(() => {
    setFeed({});
    setProbe({});
    loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      // Workflows run async; give Knock a moment, then refresh.
      const t = setTimeout(loadFeed, 2500);
      return () => clearTimeout(t);
    }
  }, [fetcher.state, fetcher.data, loadFeed]);

  async function batch(status: "seen" | "read" | "unread" | "unseen", ids: string[]) {
    const res = await fetch(`${KNOCK_API}/messages/batch/${status}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ message_ids: ids }),
    });
    setBatchResult({ status: res.status, body: await res.json().catch(() => null) });
    loadFeed();
  }

  async function probeOtherUser(otherId: number) {
    if (!ld) return;
    const res = await fetch(
      `${KNOCK_API}/users/${otherId}/feeds/${ld.feedChannelId}`,
      { headers: headers() }
    );
    setProbe({ status: res.status, body: await res.json().catch(() => null) });
  }

  if (!ld) {
    return (
      <div className="p-8">
        <Banner />
        <p>Select a user from the DevUI panel.</p>
      </div>
    );
  }

  const items: any[] = feed.body?.entries ?? [];
  const meta = feed.body?.meta;
  const tokenPayload = decodeJwt(ld.token);
  const otherId =
    ld.reply && ld.reply.questionAuthorId !== ld.userId
      ? ld.reply.questionAuthorId
      : ld.reply?.replierId;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8 text-sm">
      <Banner />
      <h1 className="text-2xl font-bold">Knock spike</h1>
      <p>
        Signed in as <b>{ld.userName}</b> (id {ld.userId}, {ld.role}). Switch users
        in the DevUI panel: the feed below must follow.
      </p>

      <Section title="1. Signed user tokens">
        <p>
          Token was signed on the server (RS256) for <code>sub={tokenPayload?.sub}</code>,
          expires {tokenPayload?.exp && new Date(tokenPayload.exp * 1000).toLocaleTimeString()}.
          Header alg: <code>{decodeJwtHeader(ld.token)?.alg}</code>.
        </p>
        <p>
          Feed call with this token: <Status s={feed.status} />
        </p>
        {otherId && (
          <p>
            <button className="rounded border px-2 py-1" onClick={() => probeOtherUser(otherId)}>
              Try reading user {otherId}'s feed with my token
            </button>{" "}
            {probe.status && (
              <>
                → <Status s={probe.status} /> (expect a rejection){" "}
                <code>{probe.body?.code ?? ""}</code>
              </>
            )}
          </p>
        )}
      </Section>

      <Section title="2. Triggering (Discussion Reply → question author)">
        {ld.reply ? (
          <p>
            Uses the real reply #{ld.reply.replyId} by <b>{ld.reply.replierName}</b> on
            "{ld.reply.lessonTitle}". Recipient: <b>{ld.reply.questionAuthorName}</b>{" "}
            (id {ld.reply.questionAuthorId}). Switch to that user to see it land.
          </p>
        ) : (
          <p>No reply found in seed data.</p>
        )}
        <fetcher.Form method="post">
          <button name="intent" value="trigger-reply" className="rounded bg-black px-3 py-1 text-white">
            Trigger discussion-reply
          </button>
        </fetcher.Form>
      </Section>

      <Section title="3. Headless feed API">
        <p>
          unread_count: <b>{meta?.unread_count ?? "–"}</b> · unseen_count:{" "}
          <b>{meta?.unseen_count ?? "–"}</b> · total items: {items.length}{" "}
          <button className="ml-2 rounded border px-2 py-1" onClick={loadFeed}>
            Refresh
          </button>
          {items.length > 0 && (
            <>
              <button className="ml-2 rounded border px-2 py-1" onClick={() => batch("seen", items.map((i) => i.id))}>
                Mark all seen
              </button>
              <button className="ml-2 rounded border px-2 py-1" onClick={() => batch("read", items.map((i) => i.id))}>
                Mark all read
              </button>
            </>
          )}
        </p>
        <ul className="divide-y rounded border">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-4 p-2">
              <div>
                <div>
                  <b>{i.source?.key}</b> · {i.data?.replier_name ?? i.data?.student_name}{" "}
                  · {i.data?.lesson_title ?? i.data?.course_title}
                </div>
                <div className="text-xs text-gray-500">
                  {i.inserted_at} · seen {i.seen_at ? "✓" : "✗"} · read {i.read_at ? "✓" : "✗"}
                </div>
              </div>
              <div className="flex gap-1">
                <button className="rounded border px-2" onClick={() => batch(i.read_at ? "unread" : "read", [i.id])}>
                  {i.read_at ? "Mark unread" : "Mark read"}
                </button>
              </div>
            </li>
          ))}
          {items.length === 0 && <li className="p-2 text-gray-500">Feed is empty.</li>}
        </ul>
        {batchResult.status && (
          <p>
            Last mark call: <Status s={batchResult.status} />
          </p>
        )}
      </Section>

      <Section title="4. Preferences (new Enrollment → Instructor, off by default)">
        {ld.enrollment ? (
          <p>
            Uses the real enrollment of <b>{ld.enrollment.studentName}</b> in "
            {ld.enrollment.courseTitle}". Recipient: instructor{" "}
            <b>{ld.enrollment.instructorName}</b> (id {ld.enrollment.instructorId}).
          </p>
        ) : (
          <p>No enrollment found in seed data.</p>
        )}
        <p>
          Walk it: as that instructor, <i>Clear my preferences</i> → trigger (nothing should
          arrive) → <i>Opt in</i> → trigger (it arrives) → <i>Opt out</i> → trigger (nothing).
        </p>
        <fetcher.Form method="post" className="flex flex-wrap gap-2">
          <button name="intent" value="clear-prefs" className="rounded border px-2 py-1">Clear my preferences</button>
          <button name="intent" value="opt-in" className="rounded border px-2 py-1">Opt in to Enrollments (in-app)</button>
          <button name="intent" value="opt-out" className="rounded border px-2 py-1">Opt out of Enrollments (in-app)</button>
          <button name="intent" value="trigger-enrollment" className="rounded bg-black px-3 py-1 text-white">
            Trigger new-enrollment
          </button>
        </fetcher.Form>
        <Json label="My preference set (as Knock stores it)" value={ld.preferences} />
      </Section>

      <Json label="Last action" value={fetcher.data} />
      <Json label="Raw feed response" value={feed} />
    </div>
  );
}

function Banner() {
  return (
    <div className="rounded bg-yellow-200 p-2 font-bold">
      PROTOTYPE — throwaway Knock spike. Not production code.
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded border p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Status({ s }: { s?: number }) {
  if (!s) return <span>…</span>;
  return <b className={s < 300 ? "text-green-700" : "text-red-700"}>HTTP {s}</b>;
}

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="rounded border p-2" open={label === "Last action"}>
      <summary>{label}</summary>
      <pre className="overflow-auto text-xs">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

function decodeJwt(t: string) {
  try {
    return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}
function decodeJwtHeader(t: string) {
  try {
    return JSON.parse(atob(t.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}
