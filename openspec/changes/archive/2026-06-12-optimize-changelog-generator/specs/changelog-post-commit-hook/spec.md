## ADDED Requirements

### Requirement: post-commit-hook-script
Existe el archivo `scripting/install-changelog-hook` (script bash ejecutable) que instala el hook git `post-commit` en `.git/hooks/post-commit`.

#### Scenario: instalación en repo limpio
- **WHEN** se ejecuta `scripting/install-changelog-hook` en el repo
- **THEN** se crea o reemplaza `.git/hooks/post-commit` con el contenido correcto y permisos de ejecución (`chmod +x`)

#### Scenario: instalación idempotente
- **WHEN** se ejecuta `scripting/install-changelog-hook` y `.git/hooks/post-commit` ya existe
- **THEN** se reemplaza el archivo existente; el script termina con exit code 0

### Requirement: post-commit-auto-regeneration
El hook `post-commit` instalado por `scripting/install-changelog-hook` regenera `CHANGELOG.md` y lo enmienda al commit recién creado.

#### Scenario: commit convencional
- **WHEN** se realiza un `git commit` con subject de conventional commit (`feat:`, `fix:`, etc.)
- **THEN** el hook invoca `scripting/generate-changelog`, agrega `CHANGELOG.md` al staging y ejecuta `git commit --amend --no-edit --no-verify` para incluirlo en el mismo commit

#### Scenario: commit no convencional
- **WHEN** se realiza un `git commit` con subject que no sigue conventional commits
- **THEN** el hook igualmente regenera `CHANGELOG.md` (el script no emite error por commits no mapeados) y lo enmienda al commit; el archivo refleja el historial actual aunque ese commit no genere entradas visibles

### Requirement: no-recursive-hook
El hook `post-commit` no se dispara recursivamente cuando `git commit --amend` enmienda el commit.

#### Scenario: amend interno del hook
- **WHEN** el hook ejecuta `git commit --amend --no-edit --no-verify`
- **THEN** git no dispara `post-commit` de nuevo (comportamiento estándar de git); el hook termina sin recursión
