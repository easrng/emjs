#define _XOPEN_SOURCE 500
#include "bootstrap.h"
#include "quickjs.h"
#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>
#define countof(x) (sizeof(x) / sizeof((x)[0]))

static JSValue js_print(JSContext *ctx, JSValue this_val, int argc,
                        JSValue *argv) {
  if (argc != 1)
    return JS_EXCEPTION;
  size_t len;
  const char *str = JS_ToCStringLen(ctx, &len, argv[0]);
  fwrite(str, 1, len, stdout);
  fputc('\n', stdout);
  fflush(stdout);
  JS_FreeCString(ctx, str);
  return JS_UNDEFINED;
}
static JSValue js_encode_utf8(JSContext *ctx, JSValue this_val, int argc,
                              JSValue *argv) {
  if (argc != 1)
    return JS_EXCEPTION;
  size_t len;
  const char *str = JS_ToCStringLen(ctx, &len, argv[0]);
  JSValue ab = JS_NewArrayBufferCopy(ctx, (uint8_t *)str, len);
  JS_FreeCString(ctx, str);
  return ab;
}

static JSValue js_execute_pending_job(JSContext *ctx, JSValue this_val,
                                      int argc, JSValue *argv) {
  if (argc != 0)
    return JS_EXCEPTION;
  JSContext *jctx;
  int result = JS_ExecutePendingJob(JS_GetRuntime(ctx), &jctx);
  if (jctx != NULL)
    assert(jctx == ctx);
  return result < 0 ? JS_EXCEPTION : result ? JS_TRUE : JS_FALSE;
}

static JSValue js_decode_utf8(JSContext *ctx, JSValue this_val, int argc,
                              JSValue *argv) {
  if (argc != 4)
    return JS_EXCEPTION;

  uint32_t byteOffset;
  size_t byteLength;
  uint8_t *str = JS_GetArrayBuffer(ctx, &byteLength, argv[0]);
  if (JS_ToUint32(ctx, &byteOffset, argv[1]) < 0)
    return JS_EXCEPTION;
  if (byteOffset > byteLength)
    return JS_EXCEPTION;
  return JS_NewStringLen(ctx, (char *)(byteOffset + str),
                         byteLength - byteOffset);
}
static JSValue js_realpath(JSContext *ctx, JSValue this_val, int argc,
                           JSValue *argv) {
  if (argc != 1)
    return JS_EXCEPTION;
  const char *str = JS_ToCString(ctx, argv[0]);
  char *resolved = realpath(str, NULL);
  JS_FreeCString(ctx, str);
  if (resolved == NULL)
    return JS_UNDEFINED;
  JSValue result = JS_NewString(ctx, resolved);
  free(resolved);
  return result;
}
static JSValue js_getcwd(JSContext *ctx, JSValue this_val, int argc,
                         JSValue *argv) {
  if (argc != 0)
    return JS_EXCEPTION;
  char *resolved = getcwd(NULL, 0);
  if (resolved == NULL)
    return JS_UNDEFINED;
  JSValue result = JS_NewString(ctx, resolved);
  free(resolved);
  return result;
}
static JSValue js_readtextfile(JSContext *ctx, JSValue this_val, int argc,
                               JSValue *argv) {
  if (argc != 1)
    return JS_EXCEPTION;
  const char *str = JS_ToCString(ctx, argv[0]);
  FILE *infile = fopen(str, "rb");
  JS_FreeCString(ctx, str);
  if (infile == NULL)
    return JS_UNDEFINED;
  if (fseek(infile, 0L, SEEK_END)) {
    fclose(infile);
    return JS_UNDEFINED;
  };
  long numbytes = ftell(infile);
  if (fseek(infile, 0L, SEEK_SET)) {
    fclose(infile);
    return JS_UNDEFINED;
  };
  char *buffer = malloc(numbytes);
  if (buffer == NULL) {
    fclose(infile);
    return JS_UNDEFINED;
  }
  if (fread(buffer, 1, numbytes, infile) != numbytes) {
    fclose(infile);
    free(buffer);
    return JS_UNDEFINED;
  }
  JSValue result = JS_NewStringLen(ctx, buffer, numbytes);
  free(buffer);
  fclose(infile);
  return result;
}
static JSValue js_getmode(JSContext *ctx, JSValue this_val, int argc,
                          JSValue *argv) {
  if (argc != 1)
    return JS_EXCEPTION;
  const char *str = JS_ToCString(ctx, argv[0]);
  struct stat stats;
  int error = stat(str, &stats);
  JS_FreeCString(ctx, str);
  if (error)
    return JS_UNDEFINED;
  return JS_NewInt32(ctx, stats.st_mode);
}
static const JSCFunctionListEntry js_internals_funcs[] = {
    JS_CFUNC_DEF("print", 1, js_print),
    JS_CFUNC_DEF("execute_pending_job", 0, js_execute_pending_job),
    JS_CFUNC_DEF("encode_utf8", 1, js_encode_utf8),
    JS_CFUNC_DEF("decode_utf8", 4, js_decode_utf8),
    JS_CFUNC_DEF("realpath", 1, js_realpath),
    JS_CFUNC_DEF("getcwd", 0, js_getcwd),
    JS_CFUNC_DEF("readtextfile", 1, js_readtextfile),
    JS_CFUNC_DEF("getmode", 1, js_getmode),
};

static JSModuleDef *js_module_loader(JSContext *ctx, const char *module_name,
                                     void *opaque) {
  JSValue internals = *(JSValue *)opaque;
  JSModuleDef *m;

  size_t buf_len;
  const char *buf;
  JSValue func_val;

  JSValue module_name_js = JS_NewString(ctx, module_name);

  JSValue loader_load = JS_GetPropertyStr(ctx, internals, "loader_load");
  assert(JS_IsFunction(ctx, loader_load));
  JSValue result = JS_Call(ctx, loader_load, JS_NULL, 1, &module_name_js);
  JS_FreeValue(ctx, loader_load);
  if (JS_IsException(result)) {
    return NULL;
  }

  buf = JS_ToCStringLen(ctx, &buf_len, result);
  JS_FreeValue(ctx, result);

  /* compile the module */
  func_val = JS_Eval(ctx, (char *)buf, buf_len, module_name,
                     JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
  JS_FreeCString(ctx, buf);
  if (JS_IsException(func_val)) {
    JS_FreeValue(ctx, module_name_js);
    return NULL;
  }
  assert(JS_VALUE_GET_TAG(func_val) == JS_TAG_MODULE);
  m = JS_VALUE_GET_PTR(func_val);

  JSValue import_meta = JS_GetImportMeta(ctx, m);
  JSValue module_ns = JS_GetModuleNamespace(ctx, m);

  JSValue loader_init = JS_GetPropertyStr(ctx, internals, "loader_init");
  assert(JS_IsFunction(ctx, loader_init));
  JSValue argv[3] = {module_name_js, import_meta, module_ns};
  result = JS_Call(ctx, loader_init, JS_NULL, 3, argv);
  JS_FreeValue(ctx, module_name_js);
  JS_FreeValue(ctx, import_meta);
  JS_FreeValue(ctx, module_ns);
  JS_FreeValue(ctx, loader_init);
  if (JS_IsException(result)) {
    JS_FreeValue(ctx, func_val);
    return NULL;
  }
  /* the module is already referenced, so we must free it */
  JS_FreeValue(ctx, func_val);
  return m;
}

static char *js_module_resolver(JSContext *ctx, const char *module_base_name,
                                const char *module_name, void *opaque) {
  JSValue internals = *(JSValue *)opaque;
  JSValue loader_resolve = JS_GetPropertyStr(ctx, internals, "loader_resolve");
  assert(JS_IsFunction(ctx, loader_resolve));
  JSValue module_base_name_js = JS_NewString(ctx, module_base_name);
  JSValue module_name_js = JS_NewString(ctx, module_name);
  JSValue args[2] = {module_name_js, module_base_name_js};
  JSValue result = JS_Call(ctx, loader_resolve, JS_NULL, 2, args);
  JS_FreeValue(ctx, loader_resolve);
  JS_FreeValue(ctx, module_base_name_js);
  JS_FreeValue(ctx, module_name_js);
  if (JS_IsException(result)) {
    return NULL;
  }
  const char *buf = JS_ToCString(ctx, result);
  char *cbuf = strdup(buf);
  JS_FreeCString(ctx, buf);
  return cbuf;
}

int main(int argc, char **argv) {
  JSRuntime *rt;
  JSContext *ctx;
  rt = JS_NewRuntime();
  ctx = JS_NewContext(rt);
  JSValue internals = JS_NewObjectProto(ctx, JS_NULL);
  {
    JSValue js_argv = JS_NewArray(ctx);
    for (int i = 0; i < argc; i++) {
      JSValue str = JS_NewString(ctx, argv[i]);
      JS_SetPropertyUint32(ctx, js_argv, i, str);
    }
    JS_SetPropertyStr(ctx, internals, "argv", js_argv);
  }
  JS_SetModuleLoaderFunc(rt, js_module_resolver, js_module_loader,
                         (void *)&internals);
  JS_SetPropertyFunctionList(ctx, internals, js_internals_funcs,
                             countof(js_internals_funcs));
  JSValue bootstrap_mod =
      JS_Eval(ctx, bootstrap_js, bootstrap_js_len - 1,
              "emjs:internal/stage0, ./build/bootstrap.bundle.js",
              JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
  if (JS_IsException(bootstrap_mod)) {
    goto exception;
  }
  JSValue bootstrap_promise = JS_EvalFunction(ctx, bootstrap_mod);
  if (JS_IsException(bootstrap_promise)) {
    goto exception;
  }
  JS_FreeValue(ctx, bootstrap_promise);
  JSValue bootstrap_ns =
      JS_GetModuleNamespace(ctx, JS_VALUE_GET_PTR(bootstrap_mod));
  JSValue bootstrap_fn = JS_GetPropertyStr(ctx, bootstrap_ns, "default");
  JS_FreeValue(ctx, bootstrap_ns);
  JSValue bootstrap_result = JS_Call(ctx, bootstrap_fn, JS_NULL, 1, &internals);
  JS_FreeValue(ctx, bootstrap_fn);
  if (JS_IsException(bootstrap_result)) {
  exception:
    JSValue exception_val = JS_GetException(ctx);
    size_t len;
    const char *str = JS_ToCStringLen(ctx, &len, exception_val);
    fwrite(str, 1, len, stderr);
    JS_FreeCString(ctx, str);
    if (JS_IsError(ctx, exception_val)) {
      JSValue prop = JS_GetPropertyStr(ctx, exception_val, "stack");
      if (!JS_IsUndefined(prop)) {
        fputc('\n', stderr);
        str = JS_ToCStringLen(ctx, &len, prop);
        fwrite(str, 1, len, stderr);
        JS_FreeCString(ctx, str);
      }
      JS_FreeValue(ctx, prop);
    }
    JS_FreeValue(ctx, exception_val);
  }
  JS_FreeValue(ctx, internals);
  JS_FreeContext(ctx);
  JS_FreeRuntime(rt);
  return 0;
}