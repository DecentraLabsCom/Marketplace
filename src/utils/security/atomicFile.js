import fs from 'node:fs'

const NO_FOLLOW = fs.constants.O_NOFOLLOW ?? 0

export function writeFileWithDescriptor(filePath, content, { mode = 0o600 } = {}) {
  const flags = fs.constants.O_WRONLY
    | fs.constants.O_CREAT
    | fs.constants.O_TRUNC
    | NO_FOLLOW
  const fileDescriptor = fs.openSync(filePath, flags, mode)

  try {
    fs.writeFileSync(fileDescriptor, content, { encoding: 'utf8' })
    fs.fsyncSync(fileDescriptor)
  } finally {
    fs.closeSync(fileDescriptor)
  }
}
