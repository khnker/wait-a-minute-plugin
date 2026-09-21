export function createToolInterceptor() {
  return {
    intercept(tool, args, handler) {
      return handler(tool, args);
    },
  };
}
