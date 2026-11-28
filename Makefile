.PHONY: build check test bench clean

build:
	node --experimental-strip-types scripts/build.ts

test:
	CARGO_BUILD_JOBS=1 cargo test --workspace --offline
	node --experimental-strip-types scripts/build.ts
	node --experimental-strip-types --import ./bench/register-react.ts --test tests/*.test.ts

bench:
	node --experimental-strip-types bench/run-bench.ts

check:
	./scripts/check

clean:
	cargo clean
	rm -rf dist packages/ui/dist packages/styled/dist packages/styled-compiler/dist
