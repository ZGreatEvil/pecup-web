// Tiny hand-rolled router (method + path-with-:params matching).
class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const keys = [];
    const regexStr = pattern
      .split('/')
      .map((segment) => {
        if (segment.startsWith(':')) {
          const key = segment.slice(1);
          keys.push(key);
          // Every ':id' in this app is a database row id, so only digits may
          // match. Without this, /produk/abc matched, Number('abc') became NaN,
          // and Postgres rejected the query — a 500 for what is simply a page
          // that does not exist. An id-shaped-but-missing row still 404s the
          // ordinary way, inside the handler.
          // The length cap matters as much as the digits: a 24-digit id is a
          // number JavaScript prints as "1e+24", which Postgres rejects — a 500
          // for another page that simply does not exist. Real ids are nowhere
          // near 15 digits.
          return key === 'id' ? '([0-9]{1,15})' : '([^/]+)';
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    const regex = new RegExp(`^${regexStr}/?$`);
    this.routes.push({ method, regex, keys, handler });
  }

  get(pattern, handler) {
    this.add('GET', pattern, handler);
  }
  post(pattern, handler) {
    this.add('POST', pattern, handler);
  }

  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = route.regex.exec(pathname);
      if (!m) continue;
      const params = {};
      route.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(m[i + 1]);
      });
      return { handler: route.handler, params };
    }
    return null;
  }
}

module.exports = Router;
