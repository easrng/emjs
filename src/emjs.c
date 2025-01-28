#define _XOPEN_SOURCE 500
#include "cutils.h"
#include "bootstrap.h"
#include "lib.h"
#include "quickjs.h"
#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>
#define countof(x) (sizeof(x) / sizeof((x)[0]))

static JSValue js_write_str(JSContext *ctx, JSValue this_val, int argc,
                            JSValue *argv) {
  if (argc != 2)
    return JS_EXCEPTION;
  uint32_t fd;
  if (JS_ToUint32(ctx, &fd, argv[0]) < 0)
    return JS_EXCEPTION;
  size_t len;
  const char *str = JS_ToCStringLen(ctx, &len, argv[1]);
  ssize_t written = write(fd, str, len);
  JS_FreeCString(ctx, str);
  return JS_NewInt32(ctx, written);
}
static JSValue js_encode_utf8(JSContext *ctx, JSValue this_val, int argc,
                              JSValue *argv) {
  if (argc != 1)
    return JS_EXCEPTION;
  size_t len;
  const char *str = JS_ToCStringLen2(ctx, &len, argv[0], 2);
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
  uint32_t byteLength;
  size_t bufferLength;
  if (JS_ToUint32(ctx, &byteOffset, argv[1]) < 0)
    return JS_EXCEPTION;
  if (JS_ToUint32(ctx, &byteLength, argv[2]) < 0)
    return JS_EXCEPTION;
  uint8_t *str = JS_GetArrayBuffer(ctx, &bufferLength, argv[0]);
  if ((byteOffset + byteLength) > bufferLength)
    return JS_EXCEPTION;
  return JS_NewStringLen(ctx, (char *)(byteOffset + str), byteLength);
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
    JS_CFUNC_DEF("write_str", 2, js_write_str),
    JS_CFUNC_DEF("execute_pending_job", 0, js_execute_pending_job),
    JS_CFUNC_DEF("encode_utf8", 1, js_encode_utf8),
    JS_CFUNC_DEF("decode_utf8", 4, js_decode_utf8),
    JS_CFUNC_DEF("realpath", 1, js_realpath),
    JS_CFUNC_DEF("getcwd", 0, js_getcwd),
    JS_CFUNC_DEF("readtextfile", 1, js_readtextfile),
    JS_CFUNC_DEF("getmode", 1, js_getmode),
};

int js_module_noop_init(JSContext *ctx, JSModuleDef *m) { return 0; }

static JSModuleDef *js_module_loader(JSContext *ctx, const char *module_name,
                                     void *opaque) {
  JSValue internals = *(JSValue *)opaque;
  JSModuleDef *m;

  size_t buf_len;
  const char *buf;
  BOOL free_buf = 0;
  JSValue func_val;
  JSValue result;

  size_t module_name_len = strlen(module_name);
  JSValue module_name_js = JS_NewStringLen(ctx, module_name, module_name_len);

  if ((buf = lib_load(module_name_len, module_name, &buf_len)) == NULL) {
    free_buf = 1;
    JSValue loader_load = JS_GetPropertyStr(ctx, internals, "loader_load");
    assert(JS_IsFunction(ctx, loader_load));
    result = JS_Call(ctx, loader_load, JS_NULL, 1, &module_name_js);
    JS_FreeValue(ctx, loader_load);
    if (JS_IsException(result)) {
      JS_FreeValue(ctx, module_name_js);
      return NULL;
    }
    buf = JS_ToCStringLen(ctx, &buf_len, result);
    JS_FreeValue(ctx, result);
  }

  if (module_name[0] == 'j' && module_name[1] == 's' && module_name[2] == 'o' &&
      module_name[3] == 'n' && module_name[4] == ':') {
    JS_FreeValue(ctx, module_name_js);
    JSValue parsed = JS_ParseJSON2(ctx, buf, buf_len, module_name, 0);
    if (free_buf)
      JS_FreeCString(ctx, buf);
    if (JS_IsException(parsed)) {
      return NULL;
    }
    m = JS_NewCModule(ctx, module_name, js_module_noop_init);
    JS_AddModuleExport(ctx, m, "default");
    func_val =
        JS_EvalFunction(ctx, JS_DupValue(ctx, JS_MKPTR(JS_TAG_MODULE, m)));
    if (JS_IsException(func_val)) {
      JS_FreeValue(ctx, parsed);
      return NULL;
    }
    JS_FreeValue(ctx, func_val);
    JS_SetModuleExport(ctx, m, "default", parsed);
    return m;
  }

  /* compile the module */
  func_val = JS_Eval(ctx, (char *)buf, buf_len, module_name,
                     JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
  if (free_buf)
    JS_FreeCString(ctx, buf);
  if (JS_IsException(func_val)) {
    JS_FreeValue(ctx, module_name_js);
    return NULL;
  }
  assert(JS_VALUE_GET_TAG(func_val) == JS_TAG_MODULE);
  m = JS_VALUE_GET_PTR(func_val);

  JSValue import_meta = JS_GetImportMeta(ctx, m);

  JSValue loader_init = JS_GetPropertyStr(ctx, internals, "loader_init");
  assert(JS_IsFunction(ctx, loader_init));
  JSValue argv[2] = {module_name_js, import_meta};
  result = JS_Call(ctx, loader_init, JS_NULL, 2, argv);
  JS_FreeValue(ctx, module_name_js);
  JS_FreeValue(ctx, import_meta);
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
  JS_FreeValue(ctx, result);
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
  if (JS_PROMISE_REJECTED == JS_PromiseState(ctx, bootstrap_promise)) {
    JSValue result = JS_PromiseResult(ctx, bootstrap_promise);
    JS_FreeValue(ctx, bootstrap_promise);
    JS_Throw(ctx, result);
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