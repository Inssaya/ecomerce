"use client";

/**
 * Manage · Settings — how the shop is reached, and who hears about trouble.
 *
 * Both cards used to be hardcoded: the contact details in four places across
 * the storefront's own source, and the security-alert recipients as two
 * personal email addresses (one the owner's own) committed to the backend.
 * Both now come from `shop_settings`, edited here.
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
    "shop-admin-settings",
    useCallback(() => api.adminSettings(), []),
  );
  const contact = useMutation();
  const alerts = useMutation();

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [alertEmails, setAlertEmails] = useState("");
  const [contactSaved, setContactSaved] = useState(false);
  const [alertsSaved, setAlertsSaved] = useState(false);

  // What the server last confirmed, separate from `data` (frozen at fetch
  // time). A successful save updates this so "unsaved" clears immediately,
  // rather than comparing against a value that is now one save behind.
  const [saved, setSaved] = useState<{ email: string; phone: string; alert_emails: string } | null>(
    null,
  );

  useEffect(() => {
    if (data) {
      setEmail(data.email);
      setPhone(data.phone);
      setAlertEmails(data.alert_emails);
      setSaved(data);
    }
  }, [data]);

  const contactDirty = saved ? email !== saved.email || phone !== saved.phone : false;
  const alertsDirty = saved ? alertEmails !== saved.alert_emails : false;

  async function saveContact() {
    setContactSaved(false);
    const body = { email: email.trim(), phone: phone.trim() };
    const result = await contact.mutate(() => api.updateContact(body));
    if (result) {
      setSaved((current) => (current ? { ...current, ...result } : current));
      setContactSaved(true);
    }
  }

  async function saveAlerts() {
    setAlertsSaved(false);
    const trimmed = alertEmails.trim();
    const result = await alerts.mutate(() => api.updateAlertEmails(trimmed));
    if (result) {
      setSaved((current) => (current ? { ...current, ...result } : current));
      setAlertsSaved(true);
    }
  }

  return (
    <>
      <ControlStrip
        groups={[]}
        trailing={
          <>
            {contactDirty || alertsDirty ? <Pill tone="warning">unsaved</Pill> : null}
            <ManageSwitch current="settings" />
          </>
        }
      />

      {error && !data ? <LoadError message={error} onRetry={reload} /> : null}
      {loading && !data ? <Skeleton height={220} /> : null}

      {data ? (
        <div className="console-grid console-grid-2">
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
              {contact.problem ? <Text className="console-field-error">{contact.problem}</Text> : null}
              {contactSaved && !contactDirty ? <Text className="console-field-hint">Saved.</Text> : null}
              <Button variant="primary" onClick={saveContact} disabled={contact.busy || !contactDirty}>
                {contact.busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </Card>

          <Card>
            <CardHead
              title="Security alerts"
              sub="Who hears about a danger-level security event — a rate limit tripped hard, a flood of requests. Never shown to a visitor."
            />
            <div className="console-stack-sm" style={{ maxWidth: 420 }}>
              <Field
                label="Alert emails"
                hint="Comma-separated. Leave empty and nobody is emailed — events still log in Logs."
              >
                <input
                  type="text"
                  value={alertEmails}
                  onChange={(event) => setAlertEmails(event.target.value)}
                  placeholder="you@mostyle.ma, someone-else@example.com"
                />
              </Field>
              {alerts.problem ? <Text className="console-field-error">{alerts.problem}</Text> : null}
              {alertsSaved && !alertsDirty ? <Text className="console-field-hint">Saved.</Text> : null}
              <Button variant="primary" onClick={saveAlerts} disabled={alerts.busy || !alertsDirty}>
                {alerts.busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
