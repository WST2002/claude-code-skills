# Security Policy

## Supported versions

Only the latest version on the `main` branch is supported: the skills, the
`proof-of-done` and `issue-to-pr` plugins, and the website.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Email
**tripathiwageesha2002@gmail.com** with:

- what is affected (skill, plugin or website) and the version or commit,
- steps to reproduce,
- the impact you expect.

You will get a reply within 7 days. Once a fix is released, you are credited in
the changelog unless you prefer not to be.

## Intentionally vulnerable code

The [`benchmarks/`](benchmarks) folder contains sample projects that are broken
and insecure on purpose, with fake credentials, so the skills can be tested
against an answer key. They are not part of any skill or plugin. Do not run or
deploy them, and please do not report them as vulnerabilities.
