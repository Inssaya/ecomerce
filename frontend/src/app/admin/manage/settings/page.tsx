"use client";

/**
 * Manage · Settings — right now, just how the shop is reached.
 *
 * The four hardcoded copies of this (two emails, one phone, across as many
 * files) that used to live in the storefront's own source now come from one
 * database row. This is the only place that ever changes it.
 */
import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/console/api";
import { useConsoleQuery, useMutation } from "@/lib/console/query";

import { ManageSwitch } from "../ManageSwitch";
import {
  Button,
  Card,
  CardHead,
  ControlStrip,
  Field,
  LoadError,
  Pill,
  Skeleton,
  Text,
} from "../../ui/primitives";

export default function Settings() {
  const { data, error, loading, reload } = useConsoleQuery(
    "shop-settings",
    useCallback(() => api.contact(), []),
  );
  const { mutate, busy, problem } = useMutation();

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setEmail(data.email);
      setPhone(data.phone);
    }
  }, [data]);

  const dirty = data ? email !== data.email || phone !== data.phone : false;

  async function save() {
    setSaved(false);
    await mutate(() => api.updateContact({ email: email.trim(), phone: phone.trim() }), {
      onDone: () => setSaved(true),
    });
  }

  return (
    <>
      <ControlStrip
        groups={[]}
        trailing={
          <>
            {dirty ? <Pill tone="warning">unsaved</Pill> : null}
            <ManageSwitch current="settings" />
          </>
        }
      />

      {error && !data ? <LoadError message={error} onRetry={reload} /> : null}
      {loading && !data ? <Skeleton height={220} /> : null}

      {data ? (
        <Card>
          <CardHead
            title="Contact"
            sub="Shown on the storefront's contact page and to a blocked visitor. Changes here take effect everywhere — no deploy."
          />
          <div className="console-stack-sm" style={{ maxWidth: 420 }}>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="workshop@mostyle.ma"
              />
            </Field>
            <Field
              label="Phone"
              hint="A Moroccan number, e.g. 0612345678. Also builds the tel: link a blocked visitor sees."
            >
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="0612345678"
              />
            </Field>
            {problem ? <Text className="console-field-error">{problem}</Text> : null}
            {saved && !dirty ? <Text className="console-field-hint">Saved.</Text> : null}
            <Button variant="primary" onClick={save} disabled={busy || !dirty}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </Card>
      ) : null}
    </>
  );
}
