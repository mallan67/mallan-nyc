export default function AdminHome() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <ul className="list-disc pl-6">
        <li><a className="text-blue-600 hover:underline" href="/admin/agents">Agents — summaries</a></li>
        <li><a className="text-blue-600 hover:underline" href="/admin/splits">Agent/Year splits — update</a></li>
      </ul>
      <div className="text-sm text-gray-500">Data sources &amp; last updated: visible on each page.</div>
    </div>
  );
}
