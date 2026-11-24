declare function beforeAll(callback: () => void): void;
declare function afterAll(callback: () => void): void;
declare function beforeEach(callback: () => void): void;
declare function afterEach(callback: () => void): void;
declare function describe(name: string, factory: () => void): void;
declare function test(name: string, factory: () => void): void;
declare function it(name: string, factory: () => void): void;
declare const expect: any;
