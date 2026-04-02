fetch("/session-info")
  .then(r => r.json())
  .then(d => { if (d.loggedIn) window.location.href = "/dashboard"; });

fetch("/api/branding")
  .then(r => r.json())
  .then(b => {
    if (!b.serviceName) return;
    document.title = b.serviceName;
    document.getElementById("serviceName").textContent = b.serviceName;
  });
