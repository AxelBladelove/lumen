#include <stdio.h>

int main(void) {
    char line[1024];

    if (fgets(line, sizeof line, stdin) == NULL) {
        printf("\n");
        return 0;
    }

    /* TODO: recorre line hasta '\0'. Imprime cada caracter,
       convirtiendo solo las letras entre 'a' y 'z' a mayuscula. */

    return 0;
}
