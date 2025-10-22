useEffect(() => {
  (async () => {
    // Fetch Agents safely
    try {
      const ra = await fetch("/api/crm/agents", { cache: "no-store" });
      let a: any = [];
      if (ra.ok) {
        try {
          a = await ra.json();
        } catch {
          a = [];
        }
      }
      setAgents(Array.isArray(a) ? a : []);
    } catch {
      setAgents([]);
    }

    // Fetch Deals safely
    try {
      const rd = await fetch("/api/crm/deals", { cache: "no-store" });
      let d: any = [];
      if (rd.ok) {
        try {
          d = await rd.json();
        } catch {
          d = [];
        }
      }
      setDeals(Array.isArray(d) ? d : []);
    } catch {
      setDeals([]);
    }
  })();
}, []);
