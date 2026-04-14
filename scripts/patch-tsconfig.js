const fs = require('node:fs')
const path = require('node:path')

function findKoishiRootTsConfig() {
  let currentDir = __dirname

  while (currentDir !== path.parse(currentDir).root) {
    const packageJsonPath = path.join(currentDir, 'package.json')
    const tsconfigPath = path.join(currentDir, 'tsconfig.json')

    if (fs.existsSync(packageJsonPath) && fs.existsSync(tsconfigPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      if (packageJson.name === 'koishi-app' || packageJson.dependencies?.koishi) {
        return tsconfigPath
      }
    }

    currentDir = path.dirname(currentDir)
  }

  return null
}

function collectElysiaPackageMappings() {
  const packagesRoot = path.resolve(__dirname, '..', 'packages', '@elysia-ai')

  if (!fs.existsSync(packagesRoot)) {
    return []
  }

  return fs
    .readdirSync(packagesRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const dirName = entry.name
      const packageJsonPath = path.join(packagesRoot, dirName, 'package.json')
      if (!fs.existsSync(packageJsonPath)) return null

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      if (!packageJson.name?.startsWith('@elysia-ai/')) return null

      return {
        name: packageJson.name,
        sourcePath: `external/elysia-ai/packages/@elysia-ai/${dirName}/src`,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

function ensureKoishiPluginPath(tsconfigContent) {
  const newPath = 'external/elysia-ai/packages/*/src'
  const koishiPluginPattern = /("koishi-plugin-\*": \[\s*)([^\]]+?)(\s*\]\s*,)/
  const match = tsconfigContent.match(koishiPluginPattern)

  if (!match) {
    throw new Error('无法找到 "koishi-plugin-*" 配置')
  }

  if (match[2].includes(`"${newPath}"`)) {
    return tsconfigContent
  }

  const prefix = match[1]
  const existingPaths = match[2]
  const suffix = match[3]
  const cleanExistingPaths = existingPaths.trim().replace(/,\s*$/, '')
  const updatedPaths = `${cleanExistingPaths},\n        "${newPath}"`

  return tsconfigContent.replace(
    koishiPluginPattern,
    `${prefix}${updatedPaths}${suffix}`
  )
}

function buildElysiaPathBlock(mappings) {
  return mappings
    .map(({ name, sourcePath }) => {
      return `      "${name}": [\n        "${sourcePath}"\n      ],`
    })
    .join('\n')
}

function upsertElysiaPaths(tsconfigContent, mappings) {
  if (!mappings.length) {
    return tsconfigContent
  }

  const block = `${buildElysiaPathBlock(mappings)}\n`
  const sectionPattern = /(\s*"koishi-plugin-\*": \[[\s\S]*?\]\s*,\n)([\s\S]*?)(\s*\/\/ If you are developing a scoped plugin,)/
  const match = tsconfigContent.match(sectionPattern)

  if (!match) {
    throw new Error('无法定位插入 @elysia-ai 路径映射的位置')
  }

  const before = match[1]
  const between = match[2]
  const after = match[3]
  const cleanedBetween = between.replace(/\s*"@elysia-ai\/[^"]+": \[\s*[\s\S]*?\s*\],\n?/g, '')

  return tsconfigContent.replace(
    sectionPattern,
    `${before}${block}${cleanedBetween}${after}`
  )
}

function patchTsConfig() {
  try {
    if (__dirname.includes('node_modules')) {
      console.log('🔍 检测到作为依赖安装，跳过 tsconfig 配置')
      return
    }

    if (!__dirname.includes('external')) {
      console.log('🔍 检测到非开发环境，跳过 tsconfig 配置')
      return
    }

    console.log('🚀 开发环境检测通过，开始配置 tsconfig')

    const rootTsConfigPath = findKoishiRootTsConfig()

    if (!rootTsConfigPath || !fs.existsSync(rootTsConfigPath)) {
      console.error('❌ 无法找到 Koishi 项目的 tsconfig.json')
      process.exit(1)
    }

    console.log(`📁 找到 tsconfig.json: ${rootTsConfigPath}`)

    const mappings = collectElysiaPackageMappings()
    if (!mappings.length) {
      console.log('ℹ️ 未发现 @elysia-ai/* 子包，跳过路径映射补丁')
      return
    }

    const tsconfigContent = fs.readFileSync(rootTsConfigPath, 'utf8')
    const withPluginPath = ensureKoishiPluginPath(tsconfigContent)
    const nextContent = upsertElysiaPaths(withPluginPath, mappings)

    if (nextContent === tsconfigContent) {
      console.log('✅ tsconfig.json 已是最新配置，无需修改')
      return
    }

    fs.writeFileSync(rootTsConfigPath, nextContent, 'utf8')

    console.log('✅ 成功更新 tsconfig.json')
    console.log('📋 已同步 @elysia-ai/* 工作区路径映射')
  } catch (error) {
    console.error('❌ 更新 tsconfig.json 时出错:', error.message)
    process.exit(1)
  }
}

patchTsConfig()
