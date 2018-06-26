const cp = require('child_process');
const fs = require('fs-extra');

const {
  fs: {createTemporaryFolder, readFile, readJson, writeFile, writeJson},
  tests: {getPackageDirectoryPath},
} = require('pkg-tests-core');

module.exports = makeTemporaryEnv => {
  const {
    basic: basicSpecs,
    lock: lockSpecs,
    script: scriptSpecs,
    workspace: workspaceSpecs,
  } = require('pkg-tests-specs');

  describe(`Plug'n'Play`, () => {
    basicSpecs(
      makeTemporaryEnv.withConfig({
        plugNPlay: true,
      }),
    );

    lockSpecs(
      makeTemporaryEnv.withConfig({
        plugNPlay: true,
      }),
    );

    scriptSpecs(
      makeTemporaryEnv.withConfig({
        plugNPlay: true,
      }),
    );

    workspaceSpecs(
      makeTemporaryEnv.withConfig({
        plugNPlay: true,
      }),
    );

    test(
      `it should resolve two identical packages with the same object (easy)`,
      makeTemporaryEnv(
        {
          dependencies: {
            [`one-fixed-dep-1`]: getPackageDirectoryPath(`one-fixed-dep`, `1.0.0`),
            [`one-fixed-dep-2`]: getPackageDirectoryPath(`one-fixed-dep`, `1.0.0`),
            [`no-deps`]: `1.0.0`,
          },
        },
        {
          plugNPlay: true,
        },
        async ({path, run, source}) => {
          await run(`install`);

          await expect(
            source(`require('one-fixed-dep-1').dependencies['no-deps'] === require('no-deps')`),
          ).resolves.toEqual(true);
          await expect(
            source(`require('one-fixed-dep-2').dependencies['no-deps'] === require('no-deps')`),
          ).resolves.toEqual(true);
        },
      ),
    );

    test(
      `it should resolve two identical packages with the same object (complex)`,
      makeTemporaryEnv(
        {
          dependencies: {
            [`one-fixed-dep-1`]: getPackageDirectoryPath(`one-fixed-dep`, `1.0.0`),
            [`one-fixed-dep-2`]: getPackageDirectoryPath(`one-fixed-dep`, `1.0.0`),
            [`no-deps`]: `2.0.0`,
          },
        },
        {
          plugNPlay: true,
        },
        async ({path, run, source}) => {
          await run(`install`);

          await expect(
            source(
              `require('one-fixed-dep-1').dependencies['no-deps'] === require('one-fixed-dep-2').dependencies['no-deps']`,
            ),
          ).resolves.toEqual(true);

          await expect(
            source(`require('one-fixed-dep-1').dependencies['no-deps'] !== require('no-deps')`),
          ).resolves.toEqual(true);
          await expect(
            source(`require('one-fixed-dep-2').dependencies['no-deps'] !== require('no-deps')`),
          ).resolves.toEqual(true);
        },
      ),
    );

    test(
      `it should correctly resolve native Node modules`,
      makeTemporaryEnv(
        {},
        {
          plugNPlay: true,
        },
        async ({path, run, source}) => {
          await run(`install`);

          await expect(source(`require('fs') ? true : false`)).resolves.toEqual(true);
        },
      ),
    );

    test(
      `it should correctly resolve relative imports`,
      makeTemporaryEnv(
        {},
        {
          plugNPlay: true,
        },
        async ({path, run, source}) => {
          await writeFile(`${path}/foo.js`, `module.exports = 42;\n`);

          await run(`install`);

          await expect(source(`require('./foo.js')`)).resolves.toEqual(42);
        },
      ),
    );

    test(
      `it should correctly resolve deep imports`,
      makeTemporaryEnv(
        {
          dependencies: {[`various-requires`]: `1.0.0`},
        },
        {
          plugNPlay: true,
        },
        async ({path, run, source}) => {
          await run(`install`);

          await expect(source(`require('various-requires/alternative-index')`)).resolves.toEqual(42);
        },
      ),
    );

    test(
      `it should correctly resolve relative imports from within dependencies`,
      makeTemporaryEnv(
        {
          dependencies: {
            [`various-requires`]: `1.0.0`,
          },
        },
        {
          plugNPlay: true,
        },
        async ({path, run, source}) => {
          await run(`install`);

          await expect(source(`require('various-requires/relative-require')`)).resolves.toEqual(42);
        },
      ),
    );

    test(
      `it should correctly resolve an absolute path even when the issuer doesn't exist`,
      makeTemporaryEnv({}, {plugNPlay: true}, async ({path, run, source}) => {
        await run(`install`);

        const api = require(`${path}/.pnp.js`);
        api.resolveToUnqualified(`${path}/.pnp.js`, `${path}/some/path/that/doesnt/exists/please/`);
      }),
    );

    test(
      `it should fallback to the top-level dependencies when it cannot require a transitive dependency require`,
      makeTemporaryEnv(
        {dependencies: {[`various-requires`]: `1.0.0`, [`no-deps`]: `1.0.0`}},
        {
          plugNPlay: true,
        },
        async ({path, run, source}) => {
          await run(`install`);

          await expect(source(`require('various-requires/invalid-require')`)).resolves.toMatchObject({
            name: `no-deps`,
            version: `1.0.0`,
          });
        },
      ),
    );

    test(
      `it should throw an exception if a dependency tries to require something it doesn't own`,
      makeTemporaryEnv(
        {dependencies: {[`various-requires`]: `1.0.0`}},
        {
          plugNPlay: true,
        },
        async ({path, run, source}) => {
          await run(`install`);

          await expect(source(`require('various-requires/invalid-require')`)).rejects.toBeTruthy();
        },
      ),
    );

    test(
      `it should allow packages to require themselves`,
      makeTemporaryEnv(
        {
          dependencies: {[`various-requires`]: `1.0.0`},
        },
        {plugNPlay: true},
        async ({path, run, source}) => {
          await run(`install`);

          await expect(source(`require('various-requires/self') === require('various-requires')`)).resolves.toEqual(
            true,
          );
        },
      ),
    );

    test(
      `it should not add the implicit self dependency if an explicit one already exists`,
      makeTemporaryEnv(
        {
          dependencies: {[`self-require-trap`]: `1.0.0`},
        },
        {plugNPlay: true},
        async ({path, run, source}) => {
          await run(`install`);

          await expect(source(`require('self-require-trap/self') !== require('self-require-trap')`)).resolves.toEqual(
            true,
          );
        },
      ),
    );

    test(
      `it should run scripts using a Node version that auto-injects the hook`,
      makeTemporaryEnv(
        {
          dependencies: {[`no-deps`]: `1.0.0`},
          scripts: {myScript: `node -p 'require("no-deps/package.json").version'`},
        },
        {
          plugNPlay: true,
        },
        async ({path, run}) => {
          await run(`install`);

          await expect(run(`myScript`)).resolves.toMatchObject({
            stdout: `1.0.0\n`,
          });
        },
      ),
    );

    test(
      `it should install in such a way that two identical packages with different peer dependencies are different instances`,
      makeTemporaryEnv(
        {
          dependencies: {[`provides-peer-deps-1-0-0`]: `1.0.0`, [`provides-peer-deps-2-0-0`]: `1.0.0`},
        },
        {
          plugNPlay: true,
        },
        async ({path, run, source}) => {
          await run(`install`);

          await expect(
            source(`require('provides-peer-deps-1-0-0') !== require('provides-peer-deps-2-0-0')`),
          ).resolves.toEqual(true);

          await expect(source(`require('provides-peer-deps-1-0-0')`)).resolves.toMatchObject({
            name: `provides-peer-deps-1-0-0`,
            version: `1.0.0`,
            dependencies: {
              [`peer-deps`]: {
                name: `peer-deps`,
                version: `1.0.0`,
                peerDependencies: {
                  [`no-deps`]: {
                    name: `no-deps`,
                    version: `1.0.0`,
                  },
                },
              },
              [`no-deps`]: {
                name: `no-deps`,
                version: `1.0.0`,
              },
            },
          });

          await expect(source(`require('provides-peer-deps-2-0-0')`)).resolves.toMatchObject({
            name: `provides-peer-deps-2-0-0`,
            version: `1.0.0`,
            dependencies: {
              [`peer-deps`]: {
                name: `peer-deps`,
                version: `1.0.0`,
                peerDependencies: {
                  [`no-deps`]: {
                    name: `no-deps`,
                    version: `2.0.0`,
                  },
                },
              },
              [`no-deps`]: {
                name: `no-deps`,
                version: `2.0.0`,
              },
            },
          });
        },
      ),
    );

    test(
      `it should support the use case of using the result of require.resolve(...) to load a package`,
      makeTemporaryEnv(
        {
          dependencies: {[`custom-dep-a`]: `file:./custom-dep-a`},
        },
        {
          plugNPlay: true,
        },
        async ({path, run, source}) => {
          await writeFile(
            `${path}/custom-dep-a/index.js`,
            `module.exports = require('custom-dep-b')(require.resolve('no-deps'))`,
          );
          await writeJson(`${path}/custom-dep-a/package.json`, {
            name: `custom-dep-a`,
            version: `1.0.0`,
            dependencies: {[`custom-dep-b`]: `file:../custom-dep-b`, [`no-deps`]: `1.0.0`},
          });

          await writeFile(`${path}/custom-dep-b/index.js`, `module.exports = path => require(path)`);
          await writeJson(`${path}/custom-dep-b/package.json`, {name: `custom-dep-b`, version: `1.0.0`});

          await run(`install`);

          await expect(source(`require('custom-dep-a')`)).resolves.toMatchObject({
            name: `no-deps`,
            version: `1.0.0`,
          });
        },
      ),
    );

    test(
      `it should not break the tree path when loading through the result of require.resolve(...)`,
      makeTemporaryEnv(
        {
          dependencies: {[`custom-dep-a`]: `file:./custom-dep-a`},
        },
        {
          plugNPlay: true,
        },
        async ({path, run, source}) => {
          await writeFile(
            `${path}/custom-dep-a/index.js`,
            `module.exports = require('custom-dep-b')(require.resolve('custom-dep-c'))`,
          );
          await writeJson(`${path}/custom-dep-a/package.json`, {
            name: `custom-dep-a`,
            version: `1.0.0`,
            dependencies: {[`custom-dep-b`]: `file:../custom-dep-b`, [`custom-dep-c`]: `file:../custom-dep-c`},
          });

          await writeFile(`${path}/custom-dep-b/index.js`, `module.exports = path => require(path)`);
          await writeJson(`${path}/custom-dep-b/package.json`, {name: `custom-dep-b`, version: `1.0.0`});

          await writeFile(`${path}/custom-dep-c/index.js`, `module.exports = require('no-deps')`);
          await writeJson(`${path}/custom-dep-c/package.json`, {
            name: `custom-dep-c`,
            version: `1.0.0`,
            dependencies: {[`no-deps`]: `1.0.0`},
          });

          await run(`install`);

          await expect(source(`require('custom-dep-a')`)).resolves.toMatchObject({
            name: `no-deps`,
            version: `1.0.0`,
          });
        },
      ),
    );

    test(
      `it should load the index.js file when loading from a folder`,
      makeTemporaryEnv({}, {plugNPlay: true}, async ({path, run, source}) => {
        await run(`install`);

        const tmp = await createTemporaryFolder();

        await writeFile(`${tmp}/folder/index.js`, `module.exports = 42;`);

        await expect(source(`require("${tmp}/folder")`)).resolves.toEqual(42);
      }),
    );

    test(
      `it should resolve the .js extension`,
      makeTemporaryEnv({}, {plugNPlay: true}, async ({path, run, source}) => {
        await run(`install`);

        const tmp = await createTemporaryFolder();

        await writeFile(`${tmp}/file.js`, `module.exports = 42;`);

        await expect(source(`require("${tmp}/file")`)).resolves.toEqual(42);
      }),
    );

    test(
      `it should use the regular Node resolution when requiring files outside of the pnp install tree`,
      makeTemporaryEnv({}, {plugNPlay: true}, async ({path, run, source}) => {
        await run(`install`);

        const tmp = await createTemporaryFolder();

        await writeFile(`${tmp}/node_modules/dep/index.js`, `module.exports = 42;`);
        await writeFile(`${tmp}/index.js`, `require('dep')`);

        await source(`require("${tmp}/index.js")`);
      }),
    );

    test(
      `it should allow scripts outside of the dependency tree to require files within the dependency tree`,
      makeTemporaryEnv(
        {dependencies: {[`no-deps`]: `1.0.0`}},
        {
          plugNPlay: true,
        },
        async ({path, run, source}) => {
          await run(`install`);

          const tmp = await createTemporaryFolder();

          await writeFile(`${tmp}/index.js`, `require(process.argv[2])`);
          await writeFile(`${path}/index.js`, `require('no-deps')`);

          await run(`node`, `${tmp}/index.js`, `${path}/index.js`);
        },
      ),
    );

    test(
      `it should not update the installConfig.pnp field of the package.json when installing with an environment override`,
      makeTemporaryEnv(
        {},
        {
          plugNPlay: true,
        },
        async ({path, run, source}) => {
          await run(`install`);

          await expect(readJson(`${path}/package.json`)).resolves.not.toMatchObject({
            installConfig: {pnp: true},
          });
        },
      ),
    );

    test(
      `it should update the installConfig.pnp field of the package.json when installing with --enable-pnp`,
      makeTemporaryEnv({}, async ({path, run, source}) => {
        await run(`install`, `--enable-pnp`);

        await expect(readJson(`${path}/package.json`)).resolves.toMatchObject({
          installConfig: {pnp: true},
        });
      }),
    );

    test(
      `it should install dependencies using pnp when the installConfig.pnp field is set to true`,
      makeTemporaryEnv(
        {
          dependencies: {[`no-deps`]: `1.0.0`},
          installConfig: {pnp: true},
        },
        async ({path, run, source}) => {
          await run(`install`);

          expect(fs.existsSync(`${path}/.pnp.js`)).toEqual(true);
        },
      ),
    );

    test(
      `it should update the installConfig.pnp field of the package.json when installing with --disable-pnp`,
      makeTemporaryEnv(
        {
          installConfig: {pnp: true},
        },
        async ({path, run, source}) => {
          await run(`install`, `--disable-pnp`);

          await expect(readJson(`${path}/package.json`)).resolves.not.toHaveProperty('installConfig.pnp');
        },
      ),
    );

    test(
      `it should not remove other fields than installConfig.pnp when using --disable-pnp`,
      makeTemporaryEnv(
        {
          installConfig: {pnp: true, foo: true},
        },
        async ({path, run, source}) => {
          await run(`install`, `--disable-pnp`);

          await expect(readJson(`${path}/package.json`)).resolves.toHaveProperty('installConfig.foo', true);
        },
      ),
    );

    test(
      `it should generate a file that can be used as an executable to resolve a request (valid request)`,
      makeTemporaryEnv(
        {
          dependencies: {
            [`no-deps`]: `1.0.0`,
          },
        },
        {
          plugNPlay: true,
        },
        async ({path, run, source}) => {
          await run(`install`);

          expect(fs.statSync(`${path}/.pnp.js`).mode & 0o111).toEqual(0o111);

          const result = JSON.parse(cp.execFileSync(`${path}/.pnp.js`, [`no-deps`, `${path}/`], {encoding: `utf-8`}));

          expect(result[0]).toEqual(null);
          expect(typeof result[1]).toEqual(`string`);

          expect(require(result[1])).toMatchObject({
            name: `no-deps`,
            version: `1.0.0`,
          });
        },
      ),
    );

    test(
      `it should generate a file that can be used as an executable to resolve a request (builtin request)`,
      makeTemporaryEnv(
        {
          dependencies: {
            [`no-deps`]: `1.0.0`,
          },
        },
        {
          plugNPlay: true,
        },
        async ({path, run, source}) => {
          await run(`install`);

          expect(fs.statSync(`${path}/.pnp.js`).mode & 0o111).toEqual(0o111);

          const result = JSON.parse(cp.execFileSync(`${path}/.pnp.js`, [`fs`, `${path}/`], {encoding: `utf-8`}));

          expect(result[0]).toEqual(null);
          expect(result[1]).toEqual(null);
        },
      ),
    );

    test(
      `it should generate a file that can be used as an executable to resolve a request (invalid request)`,
      makeTemporaryEnv(
        {
          dependencies: {
            [`no-deps`]: `1.0.0`,
          },
        },
        {
          plugNPlay: true,
        },
        async ({path, run, source}) => {
          await run(`install`);

          expect(fs.statSync(`${path}/.pnp.js`).mode & 0o111).toEqual(0o111);

          const result = JSON.parse(
            cp.execFileSync(`${path}/.pnp.js`, [`doesnt-exists`, `${path}/`], {encoding: `utf-8`}),
          );

          expect(typeof result[0].code).toEqual(`string`);
          expect(typeof result[0].message).toEqual(`string`);

          expect(result[1]).toEqual(null);
        },
      ),
    );

    test(
      `it should generate a file with a custom shebang if configured as such`,
      makeTemporaryEnv(
        {},
        {
          plugNPlay: true,
          plugnplayShebang: `foo`,
        },
        async ({path, run, source}) => {
          await run(`install`);

          expect(await readFile(`${path}/.pnp.js`, `utf-8`)).toMatch(/^#!foo\n/);
        },
      ),
    );
  });
};