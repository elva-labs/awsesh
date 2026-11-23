use rune_kit::ComboboxOption;

pub fn options(values: &[String]) -> Vec<ComboboxOption> {
    values
        .iter()
        .map(|value| ComboboxOption::new(value, value))
        .collect()
}
