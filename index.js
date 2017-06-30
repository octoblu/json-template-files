const fs = require("fs-extra")
const path = require("path")
const Promise = require("bluebird")
const glob = Promise.promisify(require("glob"))
const map = require("lodash.map")
const find = require("lodash.find")
const uniqBy = require("lodash.uniqby")
const union = require("lodash.union")
const parseTemplate = require("json-templates")

class JSONTemplateFiles {
  constructor({ packageTemplatePath, defaultTemplatePath, templateData, outputPath }) {
    if (!packageTemplatePath) throw new Error("JSONTemplateFiles requires: packageTemplatePath")
    if (!defaultTemplatePath) throw new Error("JSONTemplateFiles requires: defaultTemplatePath")
    if (!templateData) throw new Error("JSONTemplateFiles requires: templateData")
    if (!outputPath) throw new Error("JSONTemplateFiles requires: outputPath")
    this.packageTemplatePath = packageTemplatePath
    this.defaultTemplatePath = defaultTemplatePath
    this.templateData = templateData
    this.outputPath = outputPath
  }

  process() {
    return this.findTemplates().then(templates => {
      return this.processTemplates(templates)
    })
  }

  findTemplates() {
    return this.findTemplatesFromPath(this.defaultTemplatePath).then(defaultTemplates => {
      return this.findTemplatesFromPath(this.packageTemplatePath).then(packageTemplates => {
        return Promise.resolve(this.mergeTemplates({ defaultTemplates, packageTemplates }))
      })
    })
  }

  findTemplatesFromPath(templatePath) {
    return glob(templatePath, { nodir: true }).then(templates => {
      return Promise.resolve(this.mapFilePaths(templates))
    })
  }

  mergeTemplates({ defaultTemplates, packageTemplates }) {
    return uniqBy(
      map(union(defaultTemplates, packageTemplates), template => {
        const { destPath } = template
        const packageTemplate = find(packageTemplates, { destPath })
        return packageTemplate || template
      }),
      "destPath"
    )
  }

  mapFilePaths(files) {
    return files.map(srcPath => {
      return {
        srcPath,
        destPath: this.getDestPath(srcPath),
        dirname: path.dirname(srcPath),
        isTemplate: path.basename(srcPath).indexOf("_") === 0,
      }
    })
  }

  processTemplates(templates) {
    return Promise.map(templates, template => {
      if (template.isTemplate) return this.processTemplate(template)
      return this.copyFile(template)
    })
  }

  getDestPath(file) {
    const fileRegex = new RegExp(`${path.sep}templates${path.sep}(.*)$`)
    const matches = file.match(fileRegex)
    const filePartial = matches[matches.length - 1]
    const filePath = path.join(this.outputPath, filePartial)
    const { base, dir } = path.parse(filePath)
    const newBase = base.replace(/^_/, "")
    return path.join(dir, newBase)
  }

  processTemplate(file) {
    const template = parseTemplate(fs.readFileSync(file.srcPath, "utf-8"))
    const results = template(this.templateData)
    return fs.outputFile(file.destPath, results)
  }

  copyFile(file) {
    return fs.ensureDir(file.dirname).then(() => {
      return fs.copy(file, file.destPath, { overwrite: true })
    })
  }
}

module.exports = JSONTemplateFiles
