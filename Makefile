ZIG=$(shell command -v zig)
CC=$(ZIG) cc -target x86_64-linux-musl
# CC=clang
CFLAGS=$(shell cat compile_flags.txt)
QJS_COMMIT=6e2e68fd0896957f92eb6c242a2e048c1ef3cae0
QJS_HASH=086aa94c4c5bfef62e920a06e74b63300f87859e5709a385d319b59fc3703d69
BOOTSTRAP_DEPS=$(shell echo src/bootstrap/* src/bootstrap/primordials.ts)
LIB_DEPS=$(shell find src/lib)

build/emjs: build/emjs.o build/bootstrap.o build/lib.o quickjs/libquickjs.lto.a build/.dir build/lib
	$(CC) $(CFLAGS) -lm build/emjs.o build/bootstrap.o build/lib.o quickjs/libquickjs.lto.a -o build/emjs
build/.dir:
	mkdir -p build
	touch build/.dir
build/emjs.o: build/.dir src/emjs.c src/bootstrap.h quickjs/.dir
	$(CC) $(CFLAGS) -c src/emjs.c -o build/emjs.o
src/bootstrap/primordials.ts: src/bootstrap/generate-primordials.js quickjs/qjs
	quickjs/qjs src/bootstrap/generate-primordials.js >src/bootstrap/primordials.ts
build/bootstrap.bundle.js: build/.dir $(BOOTSTRAP_DEPS) node_modules
	esbuild src/bootstrap/bootstrap.ts --tree-shaking=true --bundle --platform=neutral --main-fields=module,main --format=esm --metafile=build/esbuild-meta.json --outfile=build/bootstrap.bundle.js
build/lib: build/.dir $(LIB_DEPS) tsconfig.json tsconfig.lib.json
	rm -rf build/lib; node_modules/.bin/tsc --project tsconfig.lib.json && rm build/lib/internal/url/tr46-mapping-table.js && cp node_modules/tr46/lib/mappingTable.json build/lib/internal/url/tr46-mapping-table.json
node_modules: package.json
	pnpm i
build/.ts-checked: build/.dir tsconfig.json $(BOOTSTRAP_DEPS) node_modules
	node_modules/.bin/tsc && touch build/.ts-checked
build/.es-linted: build/.dir eslint.config.mjs tsconfig.json $(BOOTSTRAP_DEPS) node_modules
	node_modules/.bin/eslint && touch build/.es-linted
build/bootstrap.o: build/.dir build/bootstrap.bundle.js build/.ts-checked build/.es-linted
	echo '#include <stddef.h>' >build/bootstrap.c
	(printf '\0' | cat build/bootstrap.bundle.js - | xxd -n bootstrap_js -i) | sed -e 's/unsigned char/char/' -e 's/unsigned int/size_t/' >>build/bootstrap.c
	$(CC) $(CFLAGS) -c build/bootstrap.c -o build/bootstrap.o
build/lib.o: build/lib src/bundle-lib.ts
	node --experimental-strip-types src/bundle-lib.ts
	$(CC) $(CFLAGS) -c build/lib.c -o build/lib.o
quickjs/libquickjs.lto.a: quickjs/.dir quickjs/quickjs.c
	cd quickjs; make libquickjs.lto.a CONFIG_CLANG=y CONFIG_LTO=y CC="$(CC)" AR="$(ZIG) ar"
quickjs/qjsc: quickjs/.dir
	cd quickjs; make qjsc CONFIG_CLANG=y CONFIG_LTO=y CC="$(CC)" QJSC_CC='"$(ZIG)\"; *arg++ = \"cc"' AR="$(ZIG) ar"
quickjs/qjs: quickjs/.dir
	cd quickjs; make qjs CONFIG_CLANG=y CONFIG_LTO=y CC="$(CC)" QJSC_CC='"$(ZIG)\"; *arg++ = \"cc"' AR="$(ZIG) ar"
quickjs/.dir:
	mkdir -p build; rm -rf build/.quickjs-tmp && mkdir build/.quickjs-tmp && wget https://github.com/bellard/quickjs/archive/$(QJS_COMMIT).tar.gz -O build/quickjs.tar.gz && tar xzf build/quickjs.tar.gz -C build/.quickjs-tmp --strip-components 1; HASH="$$(find build/.quickjs-tmp -type f -print0 | sort -z | xargs -0 sha256sum | sed 's| build/.quickjs-tmp/| |' | sha256sum | cut -d ' ' -f 1)"; if [ "$$HASH" = "$(QJS_HASH)" ]; then rm -rf quickjs; touch build/.quickjs-tmp/.dir; patch build/.quickjs-tmp/quickjs.c patches/quickjs.c.patch; mv build/.quickjs-tmp quickjs; else printf '\n!!!!!!!!!!!!!!!!!!!!!!!\n!!! WRONG SHA256SUM !!!\n!!!!!!!!!!!!!!!!!!!!!!!\nexpected %s\ngot %s\n' $(QJS_HASH) "$$HASH"; exit 1; fi; rm -f build/quickjs.tar.gz
clean:
	rm -rf build
clean-qjs:
	cd quickjs; make clean
clean-all: clean
	rm -rf node_modules quickjs
run: build/emjs
	build/emjs
wpt-url: build/emjs
	ls ./node_modules/wpt/url/*.any.js | xargs -n 1 build/emjs ./wpt.js | jq  --slurp --raw-output 'group_by(.test) as $$tests | "ran \(map(select(.result)) | length) tests from \($$tests | length) files\n\(map(select(.result.status > 0 or .harnessStatus.status > 0)| tojson) | join("\n") | if . == "" then "all passed!" else "failures:\n" + . end)"'
wpt-encoding: build/emjs
	ls ./node_modules/wpt/encoding/text*.any.js | xargs -n 1 build/emjs ./wpt.js | jq  --slurp --raw-output 'group_by(.test) as $$tests | "ran \(map(select(.result)) | length) tests from \($$tests | length) files\n\(map(select(.result.status > 0 or .harnessStatus.status > 0)| tojson) | join("\n") | if . == "" then "all passed!" else "failures:\n" + . end)"'
wpt: wpt-url wpt-encoding
.PHONY: clean clean-qjs clean-all run wpt-url wpt-encoding wpt
