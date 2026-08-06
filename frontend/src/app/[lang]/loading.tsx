export default function Loading() {
  // Deliberately quiet: a spinner on every navigation makes a calm shop feel
  // busy. The skeleton on each page carries the wait instead.
  return <div className="page pt-10" aria-hidden />;
}
