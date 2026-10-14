
  import { type TestLogger } from '@paperback/types'
  import { TestSuite, registerDefaultTests } from './suite.js'
  import { Hijala } from '../Hijala/main.js'
  import sourceInfo from '../Hijala/pbconfig.js'
  
  export async function runTests(logger: TestLogger) {
    const suite = new TestSuite('Hijala tests', logger)
    registerDefaultTests(suite, Hijala, sourceInfo)
    
    await suite.run()
  }