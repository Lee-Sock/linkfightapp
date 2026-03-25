# Display and formatting utilities


def rx_color(rx_dbm: float) -> str:
    """Return color coding for signal strength.

    Color thresholds (aligned with gameplay quality bands):
    - Green:  >= -94 dBm  (Excellent / Good)
    - Orange: -94 to -105 dBm  (Fair / Poor)
    - Red:    < -105 dBm  (Critical)
    """
    if rx_dbm >= -94.0:
        return "green"
    elif rx_dbm >= -105.0:
        return "orange"
    else:
        return "red"
