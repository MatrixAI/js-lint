async function setup() {
  // eslint-disable-next-line no-console
  console.log('\nGLOBAL SETUP');
  return async () => {
    const { default: teardown } = await import('./globalTeardown.js');
    await teardown();
  };
}

export default setup;
