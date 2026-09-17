// Asset files are intentionally exported through this barrel so UI modules do
// not depend on build-time filesystem paths.
export { default as gameAgentMascot } from './gameagent-mascot-ui.png';
export { default as fireMountainExample } from './fire-mountain-example.png';
// Share the built-in template artwork rather than maintaining a duplicate.
// eslint-disable-next-line import/no-internal-modules
export { default as zeroFactoryExample } from "agent-test/templates/variants/zero-factory-escape/public/assets/factory/zero-factory-background.png";
