export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { dbId, filter } = req.body;
  const token = process.env.VITE_NOTION_TOKEN;

  const results = [];
  let cursor = null;

  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (filter) body.filter = filter;

    const response = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ message: data.message, code: data.code });
    }

    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  res.status(200).json({ results });
}
