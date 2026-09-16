const chain = () =>
  new Proxy(function vmemBackendStub() {}, {
    get: () => chain(),
    apply: () => undefined,
  });

export const api = chain();
export const internal = chain();
