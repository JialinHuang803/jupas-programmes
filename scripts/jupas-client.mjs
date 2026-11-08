export const origin = "https://www.jupas.edu.hk";
export const pause = () => new Promise((resolve) => setTimeout(resolve, 1500));

export async function get(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "jupas-programmes/1.0 (public educational catalogue; https://github.com/JialinHuang803/jupas-programmes)" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

export async function checkRobots() {
  const response = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(30_000) });
  if (response.ok) {
    const rules = await response.text();
    // Restrictive rules need human review; do not guess whether they permit this collector.
    if (/^\s*(Disallow|Crawl-delay):\s*\S+/im.test(rules)) throw new Error("robots.txt has restrictions; review them before collecting");
  } else if (response.status !== 404) throw new Error(`robots.txt: HTTP ${response.status}; collection stopped`);
}
