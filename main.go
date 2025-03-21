package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"slices"
	"strings"
	"time"

	"github.com/aws/smithy-go"
	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/list"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"awsesh/aws"
	"awsesh/config"
	"awsesh/styles"
	"awsesh/utils"
)

// Model states
const (
	stateSelectSSO = iota
	stateSelectAccount
	stateSessionSuccess
	stateAddSSO
	stateEditSSO
)

// Messages
type fetchAccountsSuccessMsg struct {
	accounts []aws.Account
}

type fetchAccountsErrMsg struct {
	err error
}

type ssoLoginSuccessMsg struct {
	accessToken string
}

type ssoLoginErrMsg struct {
	err error
}

type credentialsSetMsg struct{}

type ssoTokenPollingTickMsg struct {
	info *aws.SSOLoginInfo
}

// Main app model
type model struct {
	state       int
	ssoProfiles []config.SSOProfile
	selectedSSO *config.SSOProfile
	accounts    []aws.Account
	selectedAcc *aws.Account
	ssoList     list.Model
	accountList list.Model
	spinner     spinner.Model
	width       int
	height      int

	// Form for adding/editing SSO profile
	inputs       []textinput.Model
	formError    string
	formSuccess  string
	focusIndex   int
	editingIndex int // Index of the profile being edited

	// AWS
	awsClient    *aws.Client
	configMgr    *config.Manager
	accessToken  string
	errorMessage string
	loadingText  string

	// SSO verification fields
	verificationUri         string
	verificationUriComplete string
	verificationCode        string

	// Caching
	usingCachedAccounts bool
	accountsLastUpdated time.Time
}

// Items to display in list
type item struct {
	title       string
	description string
}

func (i item) Title() string       { return i.title }
func (i item) Description() string { return i.description }
func (i item) FilterValue() string { return i.title }

// Initialize form inputs
func initialInputs() []textinput.Model {
	inputs := make([]textinput.Model, 3)
	var t textinput.Model

	t = textinput.New()
	t.Placeholder = "My Company SSO"
	t.Focus()
	t.CharLimit = 50
	t.Width = 40
	t.Prompt = "› "
	t.PromptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))
	inputs[0] = t

	t = textinput.New()
	t.Placeholder = "company"
	t.CharLimit = 100
	t.Width = 40
	t.Prompt = "› "
	t.PromptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))
	inputs[1] = t

	t = textinput.New()
	t.Placeholder = "us-east-1"
	t.CharLimit = 20
	t.Width = 40
	t.Prompt = "› "
	t.PromptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))
	inputs[2] = t

	return inputs
}

// Initialize the application
func initialModel() model {
	delegate := list.NewDefaultDelegate()

	// Create empty SSO list
	ssoList := list.New([]list.Item{}, delegate, 0, 0)
	ssoList.Title = "Select AWS SSO Profile"
	ssoList.AdditionalShortHelpKeys = func() []key.Binding {
		return []key.Binding{
			key.NewBinding(
				key.WithKeys("a"),
				key.WithHelp("a", "add new"),
			),
			key.NewBinding(
				key.WithKeys("e"),
				key.WithHelp("e", "edit"),
			),
			key.NewBinding(
				key.WithKeys("d"),
				key.WithHelp("d", "delete"),
			),
		}
	}

	// Empty account list (will be populated later)
	accountList := list.New([]list.Item{}, delegate, 0, 0)
	accountList.Title = "Select AWS Account"

	// Create spinner for loading states
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))

	// Create config manager
	configMgr, err := config.NewManager()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize config manager: %v\n", err)
		os.Exit(1)
	}

	// Try to load existing profiles
	profiles, err := configMgr.LoadProfiles()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Failed to load SSO profiles: %v\n", err)
		profiles = []config.SSOProfile{}
	}

	// Create initial model
	m := model{
		state:               stateSelectSSO,
		ssoProfiles:         profiles,
		ssoList:             ssoList,
		accountList:         accountList,
		spinner:             s,
		inputs:              initialInputs(),
		focusIndex:          0,
		editingIndex:        -1,
		errorMessage:        "",
		configMgr:           configMgr,
		usingCachedAccounts: false,
		accountsLastUpdated: time.Time{},
	}

	// Update the list items
	if len(profiles) > 0 {
		m.updateSSOList()
	}

	return m
}

// Start SSO login process
func startSSOLogin(startUrl string, region string, configMgr *config.Manager, client *aws.Client) tea.Cmd {
	return func() tea.Msg {
		// First check if we have a valid cached token
		cachedToken, err := configMgr.LoadToken(startUrl)
		if err != nil {
			return ssoLoginErrMsg{err: fmt.Errorf("failed to check token cache: %w", err)}
		}

		// If we have a valid token, immediately return success
		if cachedToken != nil {
			return ssoLoginSuccessMsg{accessToken: cachedToken.AccessToken}
		}

		// Start new SSO login process
		ctx := context.Background()
		loginInfo, err := client.StartSSOLogin(ctx, startUrl)
		if err != nil {
			return ssoLoginErrMsg{err: err}
		}

		// Open browser for login
		if err := utils.OpenBrowser(loginInfo.VerificationUriComplete); err != nil {
		}

		return loginInfo
	}
}

// Helper function to create account list items
func makeAccountItems(accounts []aws.Account) []list.Item {
	accountItems := make([]list.Item, len(accounts))
	for i, acc := range accounts {
		accountItems[i] = item{
			title:       acc.Name,
			description: fmt.Sprintf("Account ID: %s, Roles: %s", acc.AccountID, strings.Join(acc.Roles, ", ")),
		}
	}

	// Sort items by title (account name) for consistent ordering
	slices.SortFunc(accountItems, func(a, b list.Item) int {
		itemA, _ := a.(item)
		itemB, _ := b.(item)
		return strings.Compare(itemA.title, itemB.title)
	})

	return accountItems
}

func pollForSSOToken(info *aws.SSOLoginInfo, client *aws.Client, configMgr *config.Manager) tea.Cmd {
	return func() tea.Msg {
		ctx := context.Background()

		token, err := client.CreateToken(ctx, info)

		if err != nil {
			var apiErr smithy.APIError
			if errors.As(err, &apiErr) {
				switch apiErr.ErrorCode() {
				case "AuthorizationPendingException":
					if time.Now().After(info.ExpiresAt) {
						return ssoLoginErrMsg{err: fmt.Errorf("authentication timed out")}
					}
					return ssoTokenPollingTickMsg{info: info}

				case "SlowDownException":
					return ssoTokenPollingTickMsg{info: info}

				case "ExpiredTokenException":
					return ssoLoginErrMsg{err: fmt.Errorf("device code expired")}

				default:
					return ssoLoginErrMsg{err: fmt.Errorf("API error: %s - %s",
						apiErr.ErrorCode(), apiErr.ErrorMessage())}
				}
			}

			if time.Now().After(info.ExpiresAt) {
				return ssoLoginErrMsg{err: fmt.Errorf("authentication timed out")}
			}

			return ssoTokenPollingTickMsg{info: info}
		}

		if token != "" {
			// Calculate token expiration (standard 8 hour session)
			expiresAt := time.Now().Add(8 * time.Hour)

			// Save the token to cache
			if err := configMgr.SaveToken(info.StartUrl, token, expiresAt); err != nil {
				fmt.Fprintf(os.Stderr, "Warning: Failed to save token to cache: %v\n", err)
			}

			return ssoLoginSuccessMsg{accessToken: token}
		}

		return ssoTokenPollingTickMsg{info: info}
	}
}

// Fetch AWS accounts
func fetchAccounts(client *aws.Client, accessToken string) tea.Cmd {
	return func() tea.Msg {
		ctx := context.Background()

		accounts, err := client.ListAccounts(ctx, accessToken)
		if err != nil {
			return fetchAccountsErrMsg{err: err}
		}

		return fetchAccountsSuccessMsg{accounts: accounts}
	}
}

// Get credentials for a role
func getRoleCredentials(client *aws.Client, accessToken, accountID, roleName string) tea.Cmd {
	return func() tea.Msg {
		ctx := context.Background()

		resp, err := client.GetRoleCredentials(ctx, accessToken, accountID, roleName)
		if err != nil {
			return ssoLoginErrMsg{err: fmt.Errorf("failed to get role credentials: %w", err)}
		}

		err = config.WriteCredentials(
			*resp.RoleCredentials.AccessKeyId,
			*resp.RoleCredentials.SecretAccessKey,
			*resp.RoleCredentials.SessionToken,
			client.Region(),
		)
		if err != nil {
			return ssoLoginErrMsg{err: fmt.Errorf("failed to write credentials: %w", err)}
		}

		return credentialsSetMsg{}
	}
}

func (m model) Init() tea.Cmd {
	return m.spinner.Tick
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

		m.ssoList.SetWidth(msg.Width)
		m.ssoList.SetHeight(msg.Height - 4)

		m.accountList.SetWidth(msg.Width)
		m.accountList.SetHeight(msg.Height - 4)

	case tea.KeyMsg:
		// Global keybindings
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit
		case "q":
			if m.state != stateAddSSO && m.state != stateEditSSO {
				return m, tea.Quit
			}
		case "esc":
			switch m.state {
			case stateSelectAccount:
				m.state = stateSelectSSO
				m.errorMessage = ""
				return m, nil
			case stateSessionSuccess:
				// Clear cached token when exiting to allow fresh login next time
				if m.selectedSSO != nil {
					if err := m.configMgr.SaveToken(m.selectedSSO.StartURL, "", time.Now()); err != nil {
						m.errorMessage = fmt.Sprintf("Failed to clear token cache: %v", err)
					}
				}
				m.state = stateSelectAccount
				return m, nil
			case stateAddSSO, stateEditSSO:
				// Reset form
				m.inputs = initialInputs()
				m.focusIndex = 0
				m.formError = ""
				m.formSuccess = ""
				m.editingIndex = -1
				m.state = stateSelectSSO
				return m, nil
			}
		}

		// State-specific logic
		switch m.state {
		case stateSelectSSO:
			switch msg.String() {
			case "a":
				// Switch to add SSO form - works even with no profiles
				if m.ssoList.FilterState() == 0 {
					m.state = stateAddSSO
					m.formError = ""
					m.formSuccess = ""
					m.inputs = initialInputs()
					m.focusIndex = 0
					return m, nil
				}

			case "e":
				// Edit selected SSO only if profiles exist
				if len(m.ssoProfiles) > 0 && m.ssoList.FilterState() == 0 {
					if i, ok := m.ssoList.SelectedItem().(item); ok {
						for idx, profile := range m.ssoProfiles {
							if profile.Name == i.Title() {
								// Initialize form with existing values
								m.editingIndex = idx
								m.state = stateEditSSO
								m.formError = ""
								m.formSuccess = ""
								m.inputs = initialInputs()

								// Extract company name from URL
								companyName := strings.TrimPrefix(profile.StartURL, "https://")
								companyName = strings.TrimSuffix(companyName, ".awsapps.com/start")

								// Set values from selected profile
								m.inputs[0].SetValue(profile.Name)
								m.inputs[1].SetValue(companyName)
								m.inputs[2].SetValue(profile.Region)

								m.focusIndex = 0
								return m, nil
							}
						}
					}
				}

			case "d":
				// Delete selected SSO only if profiles exist
				if len(m.ssoProfiles) > 0 && m.ssoList.FilterState() == 0 {
					if i, ok := m.ssoList.SelectedItem().(item); ok {
						for idx, profile := range m.ssoProfiles {
							if profile.Name == i.Title() {
								// Remove the profile
								m.ssoProfiles = slices.Delete(m.ssoProfiles, idx, idx+1)

								// Update the list
								m.updateSSOList()

								// Save the updated profiles
								if err := m.configMgr.SaveProfiles(m.ssoProfiles); err != nil {
									m.errorMessage = fmt.Sprintf("Failed to save SSO profiles: %v", err)
									return m, nil
								}
								return m, nil
							}
						}
					}
				}

			case "enter":
				// Only proceed if profiles exist
				if len(m.ssoProfiles) > 0 {
					i, ok := m.ssoList.SelectedItem().(item)
					if ok {
						for _, profile := range m.ssoProfiles {
							if profile.Name == i.Title() {
								// Check if we're switching to a different SSO profile
								if m.selectedSSO == nil || m.selectedSSO.Name != profile.Name {
									// Clear accounts and reset list when switching profiles
									m.accounts = nil
									m.accountList.SetItems([]list.Item{})
									m.usingCachedAccounts = false
									// Reset the account list title to avoid showing the previous SSO name
									m.accountList.Title = "Select AWS Account"
								}

								m.selectedSSO = &profile

								// Initialize AWS client for the selected region
								var err error
								m.awsClient, err = aws.NewClient(profile.Region)
								if err != nil {
									m.errorMessage = fmt.Sprintf("Failed to initialize AWS client: %v", err)
									return m, nil
								}

								// Load cached accounts if they exist
								cachedAccounts, lastUpdated, err := m.configMgr.LoadCachedAccounts(profile.StartURL)
								if err != nil {
									// Just log the error but continue with normal flow
									fmt.Fprintf(os.Stderr, "Warning: Failed to load cached accounts: %v\n", err)
								} else if len(cachedAccounts) > 0 {
									// Use cached accounts while fetching fresh ones
									m.accounts = cachedAccounts
									m.accountsLastUpdated = lastUpdated
									m.usingCachedAccounts = true

									// Update the account list items
									accountItems := makeAccountItems(m.accounts)
									m.accountList.Title = fmt.Sprintf("Select AWS Account for %s (cached)", m.selectedSSO.Name)
									m.accountList.SetItems(accountItems)
								} else {
									// No cached accounts, ensure we show loading screen
									m.accounts = nil
									m.accountList.SetItems([]list.Item{})
								}

								// Check for cached token first
								cachedToken, err := m.configMgr.LoadToken(profile.StartURL)
								if err != nil {
									m.errorMessage = fmt.Sprintf("Failed to check token cache: %v", err)
									return m, nil
								}

								// Start SSO login flow
								m.state = stateSelectAccount
								if cachedToken != nil {
									if m.usingCachedAccounts {
										m.loadingText = "Using cached session... Updating accounts in background..."
										// Start background fetch and immediately show the cached accounts
										return m, tea.Batch(
											startSSOLogin(profile.StartURL, profile.Region, m.configMgr, m.awsClient),
											func() tea.Msg {
												// Allow the UI to immediately show the cached accounts
												return nil
											},
										)
									} else {
										m.loadingText = "Using cached session... Fetching accounts..."
										return m, startSSOLogin(profile.StartURL, profile.Region, m.configMgr, m.awsClient)
									}
								} else {
									m.loadingText = "Starting SSO login process..."
									return m, startSSOLogin(profile.StartURL, profile.Region, m.configMgr, m.awsClient)
								}
							}
						}
					}
				}
			}

		case stateSelectAccount:
			if msg.String() == "enter" {
				i, ok := m.accountList.SelectedItem().(item)
				if ok {
					for idx, acc := range m.accounts {
						if acc.Name == i.Title() {
							// For simplicity, we'll just select the first role
							if len(m.accounts[idx].Roles) > 0 {
								m.accounts[idx].SelectedRole = m.accounts[idx].Roles[0]
								m.selectedAcc = &m.accounts[idx]

								// Get credentials for the selected role
								return m, getRoleCredentials(
									m.awsClient,
									m.accessToken,
									m.selectedAcc.AccountID,
									m.selectedAcc.SelectedRole,
								)
							}
						}
					}
				}
			}

		case stateAddSSO, stateEditSSO:
			switch msg.String() {
			case "tab", "shift+tab", "enter", "up", "down":
				// Handle input navigation
				if msg.String() == "enter" && m.focusIndex == len(m.inputs) {
					// Submit form
					if m.state == stateAddSSO {
						return m.handleAddFormSubmission()
					} else {
						return m.handleEditFormSubmission()
					}
				}

				// Cycle through inputs
				if msg.String() == "up" || msg.String() == "shift+tab" {
					m.focusIndex--
				} else {
					m.focusIndex++
				}

				if m.focusIndex > len(m.inputs) {
					m.focusIndex = 0
				} else if m.focusIndex < 0 {
					m.focusIndex = len(m.inputs)
				}

				// Update focus states
				for i := range m.inputs {
					if i == m.focusIndex {
						// Set focused state
						cmds = append(cmds, m.inputs[i].Focus())
					} else {
						// Remove focused state
						m.inputs[i].Blur()
					}
				}

				return m, tea.Batch(cmds...)
			}
		}

	case *aws.SSOLoginInfo:
		// Store verification info in the model for display
		m.verificationUri = msg.VerificationUri
		m.verificationUriComplete = msg.VerificationUriComplete
		m.verificationCode = msg.UserCode
		m.loadingText = "Waiting for browser authentication..."

		// Start polling for token
		return m, tea.Batch(
			pollForSSOToken(msg, m.awsClient, m.configMgr),
			m.spinner.Tick,
		)

	case ssoLoginSuccessMsg:
		m.accessToken = msg.accessToken
		m.loadingText = "SSO login successful! Fetching accounts..."
		m.errorMessage = ""
		return m, fetchAccounts(m.awsClient, m.accessToken)

	case ssoLoginErrMsg:
		m.errorMessage = msg.err.Error()
		m.state = stateSelectSSO
		return m, nil

	case fetchAccountsSuccessMsg:
		if m.selectedSSO != nil {
			go func() {
				if err := m.configMgr.SaveCachedAccounts(m.selectedSSO.Name, m.selectedSSO.StartURL, msg.accounts); err != nil {
					fmt.Fprintf(os.Stderr, "Warning: Failed to save accounts to cache: %v\n", err)
				}
			}()
		}

		m.accounts = msg.accounts
		m.state = stateSelectAccount
		m.errorMessage = ""

		// If we're using cached accounts, we're doing a background refresh, so keep the flag
		if !m.usingCachedAccounts {
			m.usingCachedAccounts = false
		}

		// Clear loading text when fetch is complete
		m.loadingText = ""

		// Create account list items
		accountItems := makeAccountItems(m.accounts)

		// Update account list title with breadcrumb
		m.accountList.Title = fmt.Sprintf("Select AWS Account for %s", m.selectedSSO.Name)
		m.accountList.SetItems(accountItems)
		return m, nil

	case fetchAccountsErrMsg:
		m.errorMessage = msg.err.Error()
		m.state = stateSelectSSO
		return m, nil

	case credentialsSetMsg:
		m.state = stateSessionSuccess
		return m, nil

	case ssoTokenPollingTickMsg:
		// Continue polling for token completion
		if time.Now().After(msg.info.ExpiresAt) {
			m.errorMessage = "Authentication timed out"
			m.state = stateSelectSSO
			return m, nil
		}

		// Update UI and continue polling
		m.loadingText = fmt.Sprintf("Waiting for authentication... (%.0fs remaining)",
			time.Until(msg.info.ExpiresAt).Seconds())

		// Pass through the verification message with all fields including startUrl
		return m, tea.Batch(
			m.spinner.Tick,
			pollForSSOToken(msg.info, m.awsClient, m.configMgr),
		)

	case spinner.TickMsg:
		// Handle spinner ticks
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd
	}

	// Handle updates for the individual components based on state
	switch m.state {
	case stateSelectSSO:
		var cmd tea.Cmd
		m.ssoList, cmd = m.ssoList.Update(msg)
		cmds = append(cmds, cmd)

	case stateSelectAccount:
		var cmd tea.Cmd
		m.accountList, cmd = m.accountList.Update(msg)
		cmds = append(cmds, cmd)

	case stateSessionSuccess:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		cmds = append(cmds, cmd)

	case stateAddSSO, stateEditSSO:
		// Handle text input updates
		for i := range m.inputs {
			if i == m.focusIndex {
				var cmd tea.Cmd
				m.inputs[i], cmd = m.inputs[i].Update(msg)
				cmds = append(cmds, cmd)
			}
		}
	}

	return m, tea.Batch(cmds...)
}

func (m *model) handleAddFormSubmission() (tea.Model, tea.Cmd) {
	alias := strings.TrimSpace(m.inputs[0].Value())
	companyName := strings.TrimSpace(m.inputs[1].Value())
	region := strings.TrimSpace(m.inputs[2].Value())

	if alias == "" {
		m.formError = "Alias cannot be empty"
		return m, nil
	}

	if companyName == "" {
		m.formError = "Company name cannot be empty"
		return m, nil
	}

	if region == "" {
		m.formError = "Region cannot be empty"
		return m, nil
	}

	portalURL := fmt.Sprintf("https://%s.awsapps.com/start", companyName)

	for _, profile := range m.ssoProfiles {
		if profile.Name == alias {
			m.formError = "An SSO profile with this alias already exists"
			return m, nil
		}
	}

	newProfile := config.SSOProfile{
		Name:     alias,
		StartURL: portalURL,
		Region:   region,
	}

	m.ssoProfiles = append(m.ssoProfiles, newProfile)
	m.updateSSOList()
	m.formSuccess = "SSO profile added successfully!"
	m.formError = ""
	m.inputs = initialInputs()
	m.focusIndex = 0

	// Save profiles to config file
	if err := m.configMgr.SaveProfiles(m.ssoProfiles); err != nil {
		m.formError = fmt.Sprintf("Failed to save SSO profiles: %v", err)
		return m, nil
	}

	return m, nil
}

func (m *model) handleEditFormSubmission() (tea.Model, tea.Cmd) {
	alias := strings.TrimSpace(m.inputs[0].Value())
	companyName := strings.TrimSpace(m.inputs[1].Value())
	region := strings.TrimSpace(m.inputs[2].Value())

	if alias == "" {
		m.formError = "Alias cannot be empty"
		return m, nil
	}

	if companyName == "" {
		m.formError = "Company name cannot be empty"
		return m, nil
	}

	if region == "" {
		m.formError = "Region cannot be empty"
		return m, nil
	}

	portalURL := fmt.Sprintf("https://%s.awsapps.com/start", companyName)

	for idx, profile := range m.ssoProfiles {
		if profile.Name == alias && idx != m.editingIndex {
			m.formError = "An SSO profile with this alias already exists"
			return m, nil
		}
	}

	m.ssoProfiles[m.editingIndex] = config.SSOProfile{
		Name:     alias,
		StartURL: portalURL,
		Region:   region,
	}

	m.updateSSOList()
	m.formSuccess = "SSO profile updated successfully!"
	m.formError = ""

	// Save profiles to config file
	if err := m.configMgr.SaveProfiles(m.ssoProfiles); err != nil {
		m.formError = fmt.Sprintf("Failed to save SSO profiles: %v", err)
		return m, nil
	}

	return m, nil
}

func (m *model) updateSSOList() {
	// Update SSO list items
	ssoItems := make([]list.Item, len(m.ssoProfiles))
	for i, profile := range m.ssoProfiles {
		ssoItems[i] = item{
			title:       profile.Name,
			description: fmt.Sprintf("Region: %s", profile.Region),
		}
	}
	m.ssoList.SetItems(ssoItems)
}

func (m model) View() string {
	var s string

	// If there's an error message, show it at the bottom
	errorBar := ""
	if m.errorMessage != "" {
		errorBar = "\n" + styles.ErrorStyle.Render(m.errorMessage)
	}

	switch m.state {
	case stateSelectSSO:
		s = m.ssoList.View()

	case stateSelectAccount:
		// Show loading spinner while fetching accounts
		if len(m.accounts) == 0 || (m.accounts != nil && !m.usingCachedAccounts && m.loadingText != "") {
			// No accounts loaded yet or actively fetching non-cached accounts
			if m.verificationUri != "" && m.verificationCode != "" {
				// Existing verification screen code...
			} else {
				// Center the loading spinner and text vertically and horizontally
				loading := lipgloss.JoinHorizontal(lipgloss.Center,
					m.spinner.View(),
					" "+m.loadingText,
				)
				s = lipgloss.Place(m.width, m.height,
					lipgloss.Center, lipgloss.Center,
					loading,
				)
			}
		} else {
			s = m.accountList.View()
		}

	case stateSessionSuccess:
		// Create a more engaging success view with a checkmark icon
		header := lipgloss.NewStyle().
			Foreground(lipgloss.Color("#FFFDF5")).
			Background(styles.BaseGreen).
			Padding(0, 1).
			MarginLeft(1).
			Render("AWS Session Activated Successfully")

		checkmark := styles.SuccessIcon.Render("✓")

		details := styles.SuccessBox.Render(
			lipgloss.JoinVertical(lipgloss.Left,
				fmt.Sprintf("%s AWS Session Active", checkmark),
				"",
				fmt.Sprintf("Account: %s", styles.HighlightStyle.Render(m.selectedAcc.Name)),
				fmt.Sprintf("Account ID: %s", m.selectedAcc.AccountID),
				fmt.Sprintf("Role: %s", styles.HighlightStyle.Render(m.selectedAcc.SelectedRole)),
				"",
				styles.SuccessStyle.Render("AWS credentials have been configured successfully."),
			),
		)

		helpText := styles.FinePrint.Render("Press ESC to go back or q to quit")

		s = lipgloss.JoinVertical(lipgloss.Left,
			header,
			"",
			details,
			helpText,
		)

	case stateAddSSO, stateEditSSO:
		// ...existing code for add/edit SSO forms...
		var formTitle string
		if m.state == stateAddSSO {
			formTitle = styles.TitleStyle.Render("Add New AWS SSO Profile")
		} else {
			formTitle = styles.TitleStyle.Render("Edit AWS SSO Profile")
		}

		fields := []string{
			"Alias (friendly name):",
			"Company Name (e.g. 'mycompany' from mycompany.awsapps.com):",
			"Default Region:",
		}

		var formContent strings.Builder
		formContent.WriteString("\n\n")

		for i, field := range fields {
			input := m.inputs[i].View()
			if i == m.focusIndex {
				formContent.WriteString(fmt.Sprintf("%s\n%s\n\n", styles.HighlightStyle.Render(field), input))
			} else {
				formContent.WriteString(fmt.Sprintf("%s\n%s\n\n", lipgloss.NewStyle().Foreground(lipgloss.Color("240")).Render(field), input))
			}
		}

		button := "[ Submit ]"
		if m.focusIndex == len(m.inputs) {
			button = styles.HighlightStyle.Render("[ Submit ]")
		}
		formContent.WriteString("\n" + button + "\n\n")

		if m.formError != "" {
			formContent.WriteString("\n" + styles.ErrorStyle.Render(m.formError) + "\n")
		}

		if m.formSuccess != "" {
			formContent.WriteString("\n" + styles.SuccessStyle.Render(m.formSuccess) + "\n")
		}

		formContent.WriteString("\n" + lipgloss.NewStyle().Foreground(lipgloss.Color("240")).Render("Press ESC to cancel") + "\n")

		s = lipgloss.JoinVertical(lipgloss.Left, formTitle, formContent.String())
	}

	return s + errorBar
}

func main() {
	os.Setenv("AWS_SDK_GO_V2_ENABLETRUSTEDCREDENTIALSFEATURE", "true")

	p := tea.NewProgram(initialModel(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Printf("Error running program: %v", err)
		os.Exit(1)
	}
}
