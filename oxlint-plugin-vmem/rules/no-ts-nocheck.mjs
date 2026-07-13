const message =
  "Do not use `@ts-nocheck` or `@ts-ignore`. Fix the type error, or narrow the " +
  "value with a zod parse at its boundary. If a suppression is truly unavoidable, " +
  "use `@ts-expect-error` with an inline reason so it fails once the error is gone.";

export default {
  meta: {
    type: "problem",
    docs: { description: message },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode?.();
    return {
      Program() {
        const comments = sourceCode?.getAllComments?.() ?? [];
        for (const comment of comments) {
          if (/@ts-(nocheck|ignore)\b/.test(comment.value)) {
            context.report({ loc: comment.loc, message });
          }
        }
      },
    };
  },
};
