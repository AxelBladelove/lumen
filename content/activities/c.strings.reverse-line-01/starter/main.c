#include <stdio.h>

int main(void) {
    char line[201 + 2];

    if (fgets(line, sizeof line, stdin) == NULL) {
        return 0;
    }

    int length = 0;

    /* TODO: calcula la longitud real de la linea.
       Detente antes de '\n' o '\0'. */

    /* TODO: imprime los caracteres desde length - 1 hasta 0. */
    if (length > 0) {
        /* TODO: reemplaza este bloque por el recorrido inverso. */
    }

    printf("\n");
    return 0;
}
