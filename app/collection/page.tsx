export default function Collection(){
  return (
    <div className="container section">
      <h1 className="brand-title">Private Client Collection</h1>
      <p className="muted">Curated, owner-approved opportunities shared confidentially.</p>

      <div className="cards" style={{marginTop:12}}>
        {[1,2,3].map(i=>(
          <article className="card" key={i}>
            <img alt="" className="card-img" src={`https://picsum.photos/seed/private_${i}/640/420`} />
            <div className="card-body">
              <div className="price">$X,XXX,XXX</div>
              <div className="meta">Details available upon NDA</div>
              <div className="addr">NYC • Private</div>
              <div className="actions">
                <a className="pill" href="/client-access">Request Info</a>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
