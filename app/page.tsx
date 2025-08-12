'use client';
export default function Page() {
  return (
    <main style={{padding:20}}>
      <h1>mallan.nyc — Starter</h1>
      <p>APIs:</p>
      <ul>
        <li><a href="/api/geoclient/address?houseNumber=333&street=E%2046%20St&borough=Manhattan">/api/geoclient/address</a></li>
        <li><a href="/api/acris?borough=1&block=1336&lot=66&$limit=1">/api/acris</a></li>
        <li><a href="/api/dob/permits?bin=1066554&$limit=1">/api/dob/permits</a></li>
        <li><a href="/api/dob/violations?bin=1066554&$limit=1">/api/dob/violations</a></li>
      </ul>
    </main>
  );
}
