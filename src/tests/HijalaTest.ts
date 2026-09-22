
  import { type TestLogger } from '@paperback/types'
  import { TestSuite, registerDefaultTests } from './suite.js'
  import { HijalaTest } from '../HijalaTest/main.js'
  import sourceInfo from '../HijalaTest/pbconfig.js'
  
  export async function runTests(logger: TestLogger) {
    const suite = new TestSuite('HijalaTest tests', logger)
    registerDefaultTests(suite, HijalaTest, sourceInfo)
    
    await suite.run()
  }