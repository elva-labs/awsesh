# TODO

## UI/UX Improvements

- [ ] Show active default session in layout
- [ ] Add page to see active sessions (default and profiles)
- [ ] Show version at the bottom like in opencode
- [ ] Auto detect dark/light mode

## Theme Updates

- [ ] Update themes to use the new accenting of opencode (in flexoki the command dialog is now orange in opencode instead of green for us in flexoki light, investigate what has changed in the theme handling)

## SDK & Distribution

- [ ] Make the SDK installable from other repos through npm

## Code Quality

- [ ] Look for unused and deprecated code and functionality
- [ ] Look for placeholder functionality

## Configuration

- [ ] Move all configuration into the new config tilde/.config/awsesh/config.json
- [ ] Keep only sso profiles and other very aws specific things in the .aws/config file (we want people to be able to use for example aws sso login and sesh and have the same sso options)
- [ ] Update config migration helper
- [ ] Configurable length of session duration per SSO

## New Features

- [ ] Make an opencode plugin that allows authorizing to AWS accounts using the new awsesh SDK
- [ ] Create functionality to flush active credentials (the credentials file)
- [ ] Have a whoami command which outputs role, session details and such
